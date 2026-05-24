export const ACTION_DELAY_MIN_MS = 0;
export const ACTION_DELAY_MAX_MS = 8000;
export const ACTION_DELAY_STEP_MS = 100;
export const DEFAULT_ACTION_DELAY_MIN_MS = 2000;
export const DEFAULT_ACTION_DELAY_MAX_MS = 4000;

/**
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
export function normalizeActionDelayMs(value, fallback) {
    const numericValue = Number(value);
    const fallbackValue = Number.isFinite(fallback) ? fallback : DEFAULT_ACTION_DELAY_MIN_MS;
    if (!Number.isFinite(numericValue)) {
        return normalizeActionDelayMs(fallbackValue, DEFAULT_ACTION_DELAY_MIN_MS);
    }

    const steppedValue = Math.round(numericValue / ACTION_DELAY_STEP_MS) * ACTION_DELAY_STEP_MS;
    return Math.max(ACTION_DELAY_MIN_MS, Math.min(ACTION_DELAY_MAX_MS, steppedValue));
}

/**
 * @param {unknown} minMs
 * @param {unknown} maxMs
 * @param {number} [fallbackMinMs]
 * @param {number} [fallbackMaxMs]
 * @returns {{minMs: number, maxMs: number}}
 */
export function normalizeActionDelayRange(
    minMs,
    maxMs,
    fallbackMinMs = DEFAULT_ACTION_DELAY_MIN_MS,
    fallbackMaxMs = DEFAULT_ACTION_DELAY_MAX_MS
) {
    const normalizedMinMs = normalizeActionDelayMs(minMs, fallbackMinMs);
    const normalizedMaxMs = normalizeActionDelayMs(maxMs, fallbackMaxMs);

    return {
        minMs: Math.min(normalizedMinMs, normalizedMaxMs),
        maxMs: Math.max(normalizedMinMs, normalizedMaxMs)
    };
}

/**
 * @param {{delayMinMs?: unknown, delayMaxMs?: unknown}} config
 * @returns {number}
 */
export function getRandomActionDelayMs(config) {
    const { minMs, maxMs } = normalizeActionDelayRange(config.delayMinMs, config.delayMaxMs);
    const delayRangeMs = maxMs - minMs;
    return minMs + Math.floor(Math.random() * (delayRangeMs + 1));
}

/**
 * @param {number} delayMs
 * @returns {string}
 */
export function formatActionDelaySeconds(delayMs) {
    return `${(delayMs / 1000).toFixed(1)}s`;
}
