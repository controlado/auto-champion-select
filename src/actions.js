import { patchConfig, readConfig } from "./config-store.js";
import { showErrorToast, showPromiseToast, showSuccessToast } from "./toast.js";

const PLUGIN_COMMAND_GROUP = "Balaclava: Auto Champion Select";

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
            name: () => `Auto ${name} [${readConfig(configKey).enabled ? "ON" : "OFF"}]`,
            legend: () => readConfig(configKey).enabled ? "Turn OFF" : "Turn ON",
            tags: [PLUGIN_COMMAND_GROUP, configKey, "switch"],
            group: PLUGIN_COMMAND_GROUP,
            callback,
            toasts: {
                on: `Auto ${name} is ON!`,
                off: `Auto ${name} is OFF!`,
                error: `Failed to toggle Auto ${name}. Check console.`
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
     * @param {string} name
     * @param {"controladoPick" | "controladoBan"} configKey
     */
    constructor(name, configKey) {
        const isPickConfig = configKey === "controladoPick";
        const settingName = `Ignore Team Intent ${name}`;
        super({
            id: `${configKey}ForceSwitch`,
            name: () => `${settingName} [${readConfig(configKey).force ? "ON" : "OFF"}]`,
            legend: () => isPickConfig
                ? "Pick champions even when a teammate shows the same intent"
                : "Ban champions even when an ally shows the same intent",
            tags: [PLUGIN_COMMAND_GROUP, configKey, "force", "intent", "switch"],
            group: PLUGIN_COMMAND_GROUP,
            callback: () => toggleForceConfig(configKey),
            toasts: {
                on: `${settingName} is ON!`,
                off: `${settingName} is OFF!`,
                error: `Failed to toggle ${settingName}. Check console.`
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
            name: () => "Refresh Champions",
            legend: () => "Normally champion selectors refresh automatically...",
            tags: [PLUGIN_COMMAND_GROUP, "refresh"],
            group: PLUGIN_COMMAND_GROUP,
            callback: refreshSelectors,
            toasts: {
                success: "Refreshed Champions!",
                error: "Failed to refresh Champions. Check console."
            }
        });
    }
}

export class AutoPickSwitchAction extends ConfigSwitchAction {
    /**
     * @param {() => boolean} callback
     */
    constructor(callback) {
        super("Pick", "controladoPick", callback);
    }
}

export class AutoBanSwitchAction extends ConfigSwitchAction {
    /**
     * @param {() => boolean} callback
     */
    constructor(callback) {
        super("Ban", "controladoBan", callback);
    }
}

export class ForcePickSwitchAction extends ForceConfigSwitchAction {
    constructor() {
        super("Pick", "controladoPick");
    }
}

export class ForceBanSwitchAction extends ForceConfigSwitchAction {
    constructor() {
        super("Ban", "controladoBan");
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
