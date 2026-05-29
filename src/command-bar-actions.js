import { patchConfig, readConfig } from "./config-store.js";
import { t } from "./i18n/index.js";
import { showErrorToast, showPromiseToast, showSuccessToast } from "./toast.js";

const PLUGIN_COMMAND_TAG = "Balaclava: Auto Champion Select";

function getPluginCommandGroup() {
    return t("commandBar.group");
}

/**
 * @typedef {Object} CommandActionToasts
 * @property {string} [loading]
 * @property {string} [success]
 * @property {string} [on]
 * @property {string} [off]
 * @property {string} error
 *
 * @typedef {Object} CommandActionDefinition
 * @property {string} id
 * @property {() => string} name
 * @property {() => string} legend
 * @property {string[]} tags
 * @property {string} group
 * @property {() => unknown | Promise<unknown>} callback
 * @property {CommandActionToasts} toasts
 */

function isPromiseLike(value) {
    return typeof value?.then === "function";
}

class CommandAction {
    /**
     * @param {CommandActionDefinition} definition
     */
    constructor({ id, name, legend, tags, group, callback, toasts }) {
        this.id = id;
        this.name = name;
        this.legend = legend;
        this.tags = tags;
        this.group = group;
        this.perform = this.perform.bind(this);
        this.callback = callback;
        this.toasts = toasts;
    }

    /**
     * CommandBar entrypoint. Shows toast feedback for async and sync callbacks.
     *
     * @returns {unknown}
     */
    perform() {
        try {
            const result = this.callback();

            if (isPromiseLike(result)) {
                return showPromiseToast(result, {
                    loading: this.toasts.loading,
                    success: this.toasts.success,
                    error: this.toasts.error
                });
            }

            const successToast = this.toasts.success || (result ? this.toasts.on : this.toasts.off);
            showSuccessToast(successToast);
        } catch (error) {
            showErrorToast(this.toasts.error);
            console.error(error);
        }
    }
}

class ConfigSwitchAction extends CommandAction {
    /**
     * @param {string} name
     * @param {"controladoPick" | "controladoBan"} configKey
     * @param {() => boolean} callback
     */
    constructor(name, configKey, callback) {
        super({
            id: `${configKey}Switch`,
            name: () => t("commandBar.autoSwitchName", {
                name,
                state: readConfig(configKey).enabled ? t("states.on") : t("states.off")
            }),
            legend: () => readConfig(configKey).enabled ? t("commandBar.turnOff") : t("commandBar.turnOn"),
            tags: [PLUGIN_COMMAND_TAG, configKey, "switch"],
            group: getPluginCommandGroup(),
            callback,
            toasts: {
                on: t("commandBar.autoSwitchOn", { name }),
                off: t("commandBar.autoSwitchOff", { name }),
                error: t("commandBar.autoSwitchError", { name })
            }
        });
    }
}

/**
 * @param {"controladoPick" | "controladoBan"} configKey
 * @returns {boolean}
 */
function toggleForceConfig(configKey) {
    const config = patchConfig(configKey, currentConfig => {
        currentConfig.force = !currentConfig.force;
        return currentConfig;
    });

    return config.force;
}

class ForceConfigSwitchAction extends CommandAction {
    /**
     * @param {"controladoPick" | "controladoBan"} configKey
     */
    constructor(configKey) {
        const isPickConfig = configKey === "controladoPick";
        const settingName = t(isPickConfig ? "commandBar.forcePickName" : "commandBar.forceBanName");
        super({
            id: `${configKey}ForceSwitch`,
            name: () => t("commandBar.forceSwitchName", {
                name: settingName,
                state: readConfig(configKey).force ? t("states.on") : t("states.off")
            }),
            legend: () => isPickConfig
                ? t("commandBar.forcePickLegend")
                : t("commandBar.forceBanLegend"),
            tags: [PLUGIN_COMMAND_TAG, configKey, "force", "intent", "switch"],
            group: getPluginCommandGroup(),
            callback: () => toggleForceConfig(configKey),
            toasts: {
                on: t("commandBar.forceSwitchOn", { name: settingName }),
                off: t("commandBar.forceSwitchOff", { name: settingName }),
                error: t("commandBar.forceSwitchError", { name: settingName })
            }
        });
    }
}

export class RefreshDropdownsAction extends CommandAction {
    /**
     * @param {() => Promise<void>} refreshSelectors
     */
    constructor(refreshSelectors) {
        super({
            id: "RefreshDropdowns",
            name: () => t("commandBar.refreshChampionsName"),
            legend: () => t("commandBar.refreshChampionsLegend"),
            tags: [PLUGIN_COMMAND_TAG, "refresh"],
            group: getPluginCommandGroup(),
            callback: refreshSelectors,
            toasts: {
                success: t("commandBar.refreshChampionsSuccess"),
                error: t("commandBar.refreshChampionsError")
            }
        });
    }
}

export class AutoPickSwitchAction extends ConfigSwitchAction {
    /**
     * @param {() => boolean} callback
     */
    constructor(callback) {
        super(t("actions.pick"), "controladoPick", callback);
    }
}

export class AutoBanSwitchAction extends ConfigSwitchAction {
    /**
     * @param {() => boolean} callback
     */
    constructor(callback) {
        super(t("actions.ban"), "controladoBan", callback);
    }
}

export class ForcePickSwitchAction extends ForceConfigSwitchAction {
    constructor() {
        super("controladoPick");
    }
}

export class ForceBanSwitchAction extends ForceConfigSwitchAction {
    constructor() {
        super("controladoBan");
    }
}

/**
 * @param {CommandAction[]} actions
 * @returns {void}
 */
export function addActions(actions) {
    for (const action of actions) {
        CommandBar.addAction(action);
    }
}
