import { toChampionId } from "./champion-ids.js";

/**
 * @typedef {"TOP" | "JUNGLE" | "MIDDLE" | "BOTTOM" | "UTILITY"} PositionValue
 *
 * @typedef {Object} PositionMetadata
 * @property {PositionValue} value
 * @property {string} label
 * @property {string} iconPath
 */

/** @type {PositionMetadata[]} */
export const POSITIONS = [
    { value: "TOP", label: "Top", iconPath: "/fe/lol-parties/icon-position-top.png" },
    { value: "JUNGLE", label: "Jungle", iconPath: "/fe/lol-parties/icon-position-jungle.png" },
    { value: "MIDDLE", label: "Mid", iconPath: "/fe/lol-parties/icon-position-middle.png" },
    { value: "BOTTOM", label: "ADC", iconPath: "/fe/lol-parties/icon-position-bottom.png" },
    { value: "UTILITY", label: "Support", iconPath: "/fe/lol-parties/icon-position-utility.png" }
];

const POSITION_VALUES = new Set(POSITIONS.map(position => position.value));

/**
 * @param {unknown} position
 * @returns {PositionValue | null}
 */
export function normalizePosition(position) {
    const normalizedPosition = String(position ?? "").toUpperCase();
    return POSITION_VALUES.has(normalizedPosition) ? normalizedPosition : null;
}

/**
 * @param {unknown} positionsByChampionId Raw storage object keyed by champion id.
 * @param {Iterable<unknown> | null} [selectedChampionIds] Optional selected ids; when present, drops positions for unselected champions.
 * @returns {Record<string, PositionValue[]>}
 */
export function normalizePositionsByChampionId(positionsByChampionId, selectedChampionIds = null) {
    const normalizedPositionsByChampionId = {};

    if (!positionsByChampionId || typeof positionsByChampionId !== "object" || Array.isArray(positionsByChampionId)) {
        return normalizedPositionsByChampionId;
    }

    const selectedChampionIdKeys = createChampionIdKeySet(selectedChampionIds);

    for (const [championIdKey, allowedPositions] of Object.entries(positionsByChampionId)) {
        const championId = toChampionId(championIdKey);
        const normalizedChampionIdKey = String(championId);
        if (
            championId === null ||
            (selectedChampionIdKeys && !selectedChampionIdKeys.has(normalizedChampionIdKey)) ||
            !Array.isArray(allowedPositions)
        ) {
            continue;
        }

        const normalizedAllowedPositions = [];
        const seenPositions = new Set();
        for (const position of allowedPositions) {
            const normalizedPosition = normalizePosition(position);
            if (!normalizedPosition || seenPositions.has(normalizedPosition)) {
                continue;
            }

            normalizedAllowedPositions.push(normalizedPosition);
            seenPositions.add(normalizedPosition);
        }

        if (normalizedAllowedPositions.length > 0) {
            normalizedPositionsByChampionId[normalizedChampionIdKey] = normalizedAllowedPositions;
        }
    }

    return normalizedPositionsByChampionId;
}

/**
 * @param {Iterable<unknown> | null} championIds
 * @returns {Set<string> | null}
 */
function createChampionIdKeySet(championIds) {
    if (!championIds) {
        return null;
    }

    const championIdKeys = new Set();
    for (const championId of championIds) {
        const normalizedChampionId = toChampionId(championId);
        if (normalizedChampionId !== null) {
            championIdKeys.add(String(normalizedChampionId));
        }
    }

    return championIdKeys;
}

/**
 * @param {unknown} position
 * @returns {PositionMetadata | undefined}
 */
export function getPositionMetadata(position) {
    return POSITIONS.find(positionMetadata => positionMetadata.value === position);
}

/**
 * @param {{positionsByChampionId?: Record<string, PositionValue[]>} | null | undefined} config
 * @param {unknown} championId
 * @returns {PositionValue[]}
 */
export function getAllowedPositionsForChampion(config, championId) {
    const normalizedChampionId = toChampionId(championId);
    if (normalizedChampionId === null) {
        return [];
    }

    return config?.positionsByChampionId?.[String(normalizedChampionId)] || [];
}

/**
 * @param {{positionsByChampionId?: Record<string, PositionValue[]>} | null | undefined} config
 * @param {unknown} championId
 * @param {unknown} assignedPosition
 * @returns {boolean}
 */
export function isChampionAllowedInPosition(config, championId, assignedPosition) {
    const allowedPositions = getAllowedPositionsForChampion(config, championId);
    if (allowedPositions.length === 0) {
        return true;
    }

    const normalizedAssignedPosition = normalizePosition(assignedPosition);
    return normalizedAssignedPosition !== null && allowedPositions.includes(normalizedAssignedPosition);
}
