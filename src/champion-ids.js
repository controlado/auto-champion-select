/**
 * @param {unknown} value
 * @returns {number | null} A positive safe integer champion id, or null when the value cannot be used as one.
 */
export function toChampionId(value) {
    const championId = Number(value);
    return Number.isSafeInteger(championId) && championId > 0 ? championId : null;
}

/**
 * @param {unknown} championIds Raw champion id list from storage or LCU API responses.
 * @param {Iterable<unknown> | null} [allowedChampionIds] Optional allow-list used to discard unavailable ids.
 * @returns {number[]} Unique normalized champion ids in input order.
 */
export function normalizeChampionIds(championIds, allowedChampionIds = null) {
    const normalizedChampionIds = [];
    const seenChampionIds = new Set();
    const allowedChampionIdSet = createChampionIdSet(allowedChampionIds);

    if (!Array.isArray(championIds)) {
        return normalizedChampionIds;
    }

    for (const championId of championIds) {
        const normalizedChampionId = toChampionId(championId);
        if (
            normalizedChampionId === null ||
            seenChampionIds.has(normalizedChampionId) ||
            (allowedChampionIdSet && !allowedChampionIdSet.has(normalizedChampionId))
        ) {
            continue;
        }

        normalizedChampionIds.push(normalizedChampionId);
        seenChampionIds.add(normalizedChampionId);
    }

    return normalizedChampionIds;
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
