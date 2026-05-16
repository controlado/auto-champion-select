import { toChampionId } from "./champion-ids.js";

export const RANDOM_CHAMPION_OPTION = "random";

/**
 * @typedef {number | typeof RANDOM_CHAMPION_OPTION} ChampionPriorityOption
 */

/**
 * @param {unknown} option
 * @returns {option is typeof RANDOM_CHAMPION_OPTION}
 */
export function isRandomChampionOption(option) {
    return option === RANDOM_CHAMPION_OPTION;
}

/**
 * @param {unknown} option
 * @returns {ChampionPriorityOption | null}
 */
export function toChampionPriorityOption(option) {
    if (isRandomChampionOption(option)) {
        return RANDOM_CHAMPION_OPTION;
    }

    return toChampionId(option);
}

/**
 * @param {unknown} option
 * @returns {string | null}
 */
export function toChampionPriorityOptionKey(option) {
    const normalizedOption = toChampionPriorityOption(option);
    return normalizedOption === null ? null : String(normalizedOption);
}

/**
 * @param {unknown} championPriorityOptions Raw option list from storage.
 * @param {Iterable<unknown> | null} [allowedChampionIds] Optional allow-list used to discard unavailable champion ids.
 * @returns {ChampionPriorityOption[]} Unique normalized priority options in input order.
 */
export function normalizeChampionPriorityOptions(championPriorityOptions, allowedChampionIds = null) {
    const normalizedOptions = [];
    const seenOptions = new Set();
    const allowedChampionIdSet = createChampionIdSet(allowedChampionIds);

    if (!Array.isArray(championPriorityOptions)) {
        return normalizedOptions;
    }

    for (const option of championPriorityOptions) {
        const normalizedOption = toChampionPriorityOption(option);
        if (normalizedOption === null) {
            continue;
        }

        const optionKey = String(normalizedOption);
        if (seenOptions.has(optionKey)) {
            continue;
        }

        if (
            !isRandomChampionOption(normalizedOption) &&
            allowedChampionIdSet &&
            !allowedChampionIdSet.has(normalizedOption)
        ) {
            continue;
        }

        normalizedOptions.push(normalizedOption);
        seenOptions.add(optionKey);
    }

    return normalizedOptions;
}

/**
 * Returns only numeric champion ids. Non-champion options such as Random are intentionally discarded before
 * position config normalization.
 *
 * @param {Iterable<unknown> | null} priorityOptions
 * @returns {number[]}
 */
export function getChampionIdsFromPriorityOptions(priorityOptions) {
    if (!priorityOptions) {
        return [];
    }

    return Array.from(priorityOptions, toChampionId)
        .filter(championId => championId !== null);
}

/**
 * @param {Iterable<unknown> | null} championIds
 * @returns {Set<number> | null}
 */
function createChampionIdSet(championIds) {
    if (!championIds) {
        return null;
    }

    return new Set(
        Array.from(championIds, toChampionId)
            .filter(championId => championId !== null)
    );
}
