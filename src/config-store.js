import defaultPluginConfig from "./config.json";
import { normalizeActionDelayRange } from "./action-delay.js";
import { normalizePositionList, normalizePositionsByChampionId } from "./champion-positions.js";
import { getChampionIdsFromPriorityOptions, normalizeChampionPriorityOptions } from "./champion-priority-options.js";

const repairedConfigWarnings = new Set();

/**
 * @typedef {"controladoAutoAccept" | "controladoActionDelay" | "controladoPick" | "controladoBan"} ConfigKey
 *
 * @typedef {Object} PluginConfig
 * @property {boolean} [enabled]
 * @property {boolean} [hideAutoAcceptPrompt]
 * @property {number} [minMs]
 * @property {number} [maxMs]
 * @property {boolean} [force]
 * @property {boolean} [pickIntent]
 * @property {number[]} [champions]
 * @property {import("./champion-priority-options.js").ChampionPriorityOption[]} [priorityOptions]
 * @property {string[]} [randomAssignedPositions]
 * @property {string[]} [randomPoolPositions]
 * @property {Record<string, string[]>} [positionsByChampionId]
 *
 * @typedef {Object} ConfigNormalizationOptions
 * @property {Iterable<unknown> | null} [allowedChampionIds] Champion ids available in the current selector.
 * @property {Iterable<unknown> | null} [selectedChampionIds] Champion ids that may keep position restrictions.
 *
 * @typedef {Object} DataStoreLike
 * @property {(key: ConfigKey) => unknown} get
 * @property {(key: ConfigKey, value: PluginConfig) => void} set
 *
 * @callback ConfigUpdater
 * @param {PluginConfig} config Mutable clone of the current normalized config.
 * @returns {PluginConfig | void}
 */

function hasOwnProperty(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
}

function hasDefaultConfigField(defaultConfig, fieldName) {
    return hasOwnProperty(defaultConfig, fieldName);
}

function getRawPriorityOptions(mergedConfig) {
    // use priorityOptions when present; fall back to legacy champions.
    return Array.isArray(mergedConfig.priorityOptions)
        ? mergedConfig.priorityOptions
        : mergedConfig.champions;
}

function getRawRandomPoolPositions(sourceConfig, mergedConfig) {
    // randomPositions is the legacy storage key for the Random champion pool filter.
    return hasOwnProperty(sourceConfig, "randomPoolPositions")
        ? sourceConfig.randomPoolPositions
        : mergedConfig.randomPositions;
}

/**
 * @returns {DataStoreLike}
 */
function getStore() {
    if (!DataStore) {
        throw new Error("DataStore is not available");
    }

    return DataStore;
}

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * @template T
 * @param {T} value
 * @returns {T}
 */
function cloneJson(value) {
    if (value === undefined) {
        return undefined;
    }

    return JSON.parse(JSON.stringify(value));
}

/**
 * @param {ConfigKey} configKey
 * @returns {PluginConfig}
 */
function getDefaultConfig(configKey) {
    const defaultConfig = defaultPluginConfig[configKey];
    if (!defaultConfig) {
        throw new Error(`Unknown auto-champion-select config key: ${configKey}`);
    }

    return cloneJson(defaultConfig);
}

/**
 * @param {ConfigKey} configKey
 * @param {unknown} config
 * @param {ConfigNormalizationOptions} [options]
 * @returns {PluginConfig}
 */
function normalizePluginConfig(configKey, config, options = {}) {
    const defaultConfig = getDefaultConfig(configKey);
    const sourceConfig = isPlainObject(config) ? cloneJson(config) : {};
    const mergedConfig = { ...defaultConfig, ...sourceConfig };
    const normalizedConfig = {};

    if (hasDefaultConfigField(defaultConfig, "enabled")) {
        normalizedConfig.enabled = mergedConfig.enabled === true;
    }

    if (hasDefaultConfigField(defaultConfig, "hideAutoAcceptPrompt")) {
        normalizedConfig.hideAutoAcceptPrompt = mergedConfig.hideAutoAcceptPrompt === true;
    }

    if (hasDefaultConfigField(defaultConfig, "minMs") && hasDefaultConfigField(defaultConfig, "maxMs")) {
        const { minMs, maxMs } = normalizeActionDelayRange(
            mergedConfig.minMs,
            mergedConfig.maxMs,
            defaultConfig.minMs,
            defaultConfig.maxMs
        );
        normalizedConfig.minMs = minMs;
        normalizedConfig.maxMs = maxMs;
    }

    if (hasDefaultConfigField(defaultConfig, "force")) {
        normalizedConfig.force = mergedConfig.force === true;
    }

    if (hasDefaultConfigField(defaultConfig, "pickIntent")) {
        normalizedConfig.pickIntent = mergedConfig.pickIntent !== false;
    }

    if (hasDefaultConfigField(defaultConfig, "champions")) {
        normalizedConfig.priorityOptions = normalizeChampionPriorityOptions(getRawPriorityOptions(mergedConfig), options.allowedChampionIds);
        normalizedConfig.champions = getChampionIdsFromPriorityOptions(normalizedConfig.priorityOptions);
    }

    if (hasDefaultConfigField(defaultConfig, "randomAssignedPositions")) {
        normalizedConfig.randomAssignedPositions = normalizePositionList(mergedConfig.randomAssignedPositions);
    }

    if (hasDefaultConfigField(defaultConfig, "randomPoolPositions")) {
        normalizedConfig.randomPoolPositions = normalizePositionList(getRawRandomPoolPositions(sourceConfig, mergedConfig));
    }

    if (hasDefaultConfigField(defaultConfig, "positionsByChampionId")) {
        normalizedConfig.positionsByChampionId = normalizePositionsByChampionId(
            mergedConfig.positionsByChampionId,
            options.selectedChampionIds || normalizedConfig.champions
        );
    }

    return normalizedConfig;
}

/**
 * @param {ConfigKey} configKey
 * @param {unknown} storedConfig
 * @param {ConfigNormalizationOptions} [options]
 * @returns {PluginConfig}
 */
function normalizeStoredConfig(configKey, storedConfig, options = {}) {
    const sourceConfig = storedConfig === undefined ? getDefaultConfig(configKey) : storedConfig;
    return normalizePluginConfig(configKey, sourceConfig, options);
}

/**
 * Reads a config key and returns the normalized runtime shape without writing it back.
 *
 * @param {ConfigKey} configKey
 * @param {ConfigNormalizationOptions} [options]
 * @returns {PluginConfig}
 */
export function readConfig(configKey, options = {}) {
    const store = getStore();
    const storedConfig = store.get(configKey);
    return normalizeStoredConfig(configKey, storedConfig, options);
}

/**
 * @param {ConfigKey} configKey
 * @param {unknown} config
 * @param {ConfigNormalizationOptions} [options]
 * @returns {PluginConfig}
 */
function writeConfig(configKey, config, options = {}) {
    const store = getStore();
    const normalizedConfig = normalizePluginConfig(configKey, config, options);
    store.set(configKey, normalizedConfig);
    return normalizedConfig;
}

function areConfigsEqual(firstConfig, secondConfig) {
    return JSON.stringify(firstConfig) === JSON.stringify(secondConfig);
}

/**
 * @param {ConfigKey} configKey
 * @param {unknown} storedConfig
 * @param {PluginConfig} normalizedConfig
 * @returns {void}
 */
function warnRepairedConfig(configKey, storedConfig, normalizedConfig) {
    if (repairedConfigWarnings.has(configKey)) {
        return;
    }

    repairedConfigWarnings.add(configKey);
    console.warn(
        `auto-champion-select: Repaired ${configKey} in DataStore. ` +
        "The stored value used a different schema; plugins like reynbow/auto-champ-lock write this shape. " +
        "Saved normalized config.",
        {
            storedConfig,
            normalizedConfig
        }
    );
}

/**
 * Reads a config key, normalizes it, and persists the normalized value if storage was missing or dirty.
 *
 * @param {ConfigKey} configKey
 * @param {ConfigNormalizationOptions} [options]
 * @returns {PluginConfig}
 */
export function ensureConfig(configKey, options = {}) {
    const store = getStore();
    const storedConfig = store.get(configKey);
    const normalizedConfig = normalizeStoredConfig(configKey, storedConfig, options);

    if (storedConfig === undefined || !areConfigsEqual(storedConfig, normalizedConfig)) {
        if (storedConfig !== undefined) {
            warnRepairedConfig(configKey, storedConfig, normalizedConfig);
        }

        store.set(configKey, normalizedConfig);
    }

    return normalizedConfig;
}

/**
 * Applies a mutation to a normalized clone, then normalizes and persists the result.
 *
 * @param {ConfigKey} configKey
 * @param {ConfigUpdater} updater
 * @param {ConfigNormalizationOptions} [options]
 * @returns {PluginConfig}
 */
export function patchConfig(configKey, updater, options = {}) {
    const currentConfig = readConfig(configKey, options);
    const nextConfig = cloneJson(currentConfig);
    const updatedConfig = updater(nextConfig) || nextConfig;
    return writeConfig(configKey, updatedConfig, options);
}
