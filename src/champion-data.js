import { request, sleep } from "https://cdn.jsdelivr.net/npm/balaclava-utils@latest";
import { toChampionId } from "./champion-ids.js";
import { LEAGUE_CLIENT_ENDPOINTS } from "./league-client-endpoints.js";

/**
 * @typedef {Object} Champion
 * @property {number} id
 * @property {string} name
 * @property {string} squarePortraitPath
 */

const PLAYABLE_CHAMPIONS_RETRY_DELAY_MS = 1000;

/**
 * Coalesces concurrent calls so repeated setup/refresh paths share the same LCU request.
 *
 * @param {() => Promise<Champion[]>} fetcher
 * @returns {() => Promise<Champion[]>}
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
 * @returns {Champion[]}
 */
function normalizeChampions(champions) {
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
            squarePortraitPath: champion.squarePortraitPath || LEAGUE_CLIENT_ENDPOINTS.championIcon(championId)
        });
        seenChampionNames.add(championName);
    }

    normalizedChampions.sort((a, b) => a.name.localeCompare(b.name));
    return normalizedChampions;
}

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

    return normalizeChampions(await response.json());
}

/**
 * @returns {Promise<Champion[]>}
 */
async function fetchAllChampions() {
    const response = await request("GET", LEAGUE_CLIENT_ENDPOINTS.championSummary);
    return normalizeChampions(await response.json());
}

export const getPlayableChampions = createCoalescedFetcher(fetchPlayableChampions);
export const getAllChampions = createCoalescedFetcher(fetchAllChampions);
