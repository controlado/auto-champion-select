import { request, sleep } from "https://cdn.jsdelivr.net/npm/balaclava-utils@latest";
import { toChampionId } from "./champion-ids.js";
import { normalizePositionsByChampionId } from "./champion-positions.js";
import { LEAGUE_CLIENT_ENDPOINTS } from "./league-client-endpoints.js";

/**
 * @typedef {import("./champion-positions.js").PositionValue} PositionValue
 *
 * @typedef {Object} Champion
 * @property {number} id
 * @property {string} name
 * @property {string} squarePortraitPath
 * @property {PositionValue[]} recommendedPositions
 */

const PLAYABLE_CHAMPIONS_RETRY_DELAY_MS = 1000;

/**
 * Coalesces concurrent calls so repeated setup/refresh paths share the same LCU request.
 *
 * @template T
 * @param {() => Promise<T>} fetcher
 * @returns {() => Promise<T>}
 */
function createCoalescedFetcher(fetcher) {
    let inFlightTask = null;

    return function coalescedFetcher() {
        if (!inFlightTask) {
            inFlightTask = Promise.resolve()
                .then(fetcher)
                .finally(() => {
                    inFlightTask = null;
                });
        }

        return inFlightTask;
    };
}

/**
 * @param {unknown} champions Raw champion objects from LCU endpoints.
 * @param {Record<string, PositionValue[]>} [recommendedPositionsByChampionId]
 * @returns {Champion[]}
 */
function normalizeChampions(champions, recommendedPositionsByChampionId = {}) {
    const normalizedChampions = [];
    const seenChampionNames = new Set();

    if (!Array.isArray(champions)) {
        return normalizedChampions;
    }

    for (const champion of champions) {
        if (!champion || typeof champion !== "object") {
            continue;
        }

        const championId = toChampionId(champion.id);
        const championName = typeof champion.name === "string" ? champion.name : "";
        if (championId === null || !championName || seenChampionNames.has(championName)) {
            continue;
        }

        normalizedChampions.push({
            ...champion,
            id: championId,
            name: championName,
            squarePortraitPath: champion.squarePortraitPath || LEAGUE_CLIENT_ENDPOINTS.championIcon(championId),
            recommendedPositions: recommendedPositionsByChampionId[String(championId)] || []
        });
        seenChampionNames.add(championName);
    }

    normalizedChampions.sort((a, b) => a.name.localeCompare(b.name));
    return normalizedChampions;
}

/**
 * @param {unknown} recommendedChampionPositions
 * @returns {Record<string, PositionValue[]>}
 */
function normalizeRecommendedChampionPositions(recommendedChampionPositions) {
    const recommendedPositionsByChampionId = {};

    if (
        !recommendedChampionPositions ||
        typeof recommendedChampionPositions !== "object" ||
        Array.isArray(recommendedChampionPositions)
    ) {
        return recommendedPositionsByChampionId;
    }

    for (const [championIdKey, championPositionInfo] of Object.entries(recommendedChampionPositions)) {
        if (!championPositionInfo || typeof championPositionInfo !== "object" || Array.isArray(championPositionInfo)) {
            continue;
        }

        recommendedPositionsByChampionId[championIdKey] = championPositionInfo.recommendedPositions;
    }

    return normalizePositionsByChampionId(recommendedPositionsByChampionId);
}

/**
 * @returns {Promise<Record<string, PositionValue[]>>}
 */
async function fetchRecommendedChampionPositionsById() {
    try {
        const response = await request("GET", LEAGUE_CLIENT_ENDPOINTS.recommendedChampionPositions);
        if (!response.ok) {
            console.warn("auto-champion-select(recommended-champion-positions): Request failed", response);
            return {};
        }

        return normalizeRecommendedChampionPositions(await response.json());
    } catch (error) {
        console.warn("auto-champion-select(recommended-champion-positions): Failed to load", error);
        return {};
    }
}

const getRecommendedChampionPositionsById = createCoalescedFetcher(fetchRecommendedChampionPositionsById);

/**
 * @returns {Promise<Champion[]>}
 */
async function fetchPlayableChampions() {
    let response = await request("GET", LEAGUE_CLIENT_ENDPOINTS.ownedChampions);

    while (!response.ok) {
        console.debug("auto-champion-select(owned-champions-minimal): Retrying...");
        response = await request("GET", LEAGUE_CLIENT_ENDPOINTS.ownedChampions);
        await sleep(PLAYABLE_CHAMPIONS_RETRY_DELAY_MS); // owned champions endpoint returns 404 at startup
    }

    return normalizeChampions(
        await response.json(),
        await getRecommendedChampionPositionsById()
    );
}

/**
 * @returns {Promise<Champion[]>}
 */
async function fetchAllChampions() {
    const [response, recommendedPositionsByChampionId] = await Promise.all([
        request("GET", LEAGUE_CLIENT_ENDPOINTS.championSummary),
        getRecommendedChampionPositionsById()
    ]);

    return normalizeChampions(await response.json(), recommendedPositionsByChampionId);
}

export const getPlayableChampions = createCoalescedFetcher(fetchPlayableChampions);
export const getAllChampions = createCoalescedFetcher(fetchAllChampions);
