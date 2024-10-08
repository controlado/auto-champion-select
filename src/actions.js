const pluginGroup = "Balaclava: Auto Champion Select";

class Action {
    constructor(id, name, legend, tags, group, callback, toasts) {
        this.id = id;
        this.name = name;
        this.legend = legend;
        this.tags = tags;
        this.group = group;
        this.perform = this.perform.bind(this);
        this.callback = callback;
        this.toasts = toasts;
    }

    perform() {
        if (typeof this.callback.then === "function") {
            return Toast.promise(
                this.callback,
                {
                    loading: this.toasts.loading,
                    success: this.toasts.success,
                    error: this.toasts.error
                }
            )
        }
        try {
            const possibleSwitch = this.callback();
            Toast.success(this.toasts.success || (possibleSwitch ? this.toasts.on : this.toasts.off));
        } catch (error) {
            Toast.error(this.toasts.error);
            console.error(error);
        }
    }
}

class FunctionSwitchAction extends Action {
    constructor(name, configKey, callback) {
        super(
            `${configKey}Switch`,
            () => `Auto ${name} [${DataStore.get(configKey)?.enabled ? "ON" : "OFF"}]`,
            () => DataStore.get(configKey)?.enabled ? `Turn OFF` : `Turn ON`,
            [pluginGroup, configKey, "switch"],
            pluginGroup,
            callback,
            {
                on: `Auto ${name} is ON!`,
                off: `Auto ${name} is OFF!`,
                error: `Failed to toggle Auto ${name}. Check console.`
            }
        )
    }
}

class ForceSwitchAction extends Action {
    constructor(name, configKey) {
        super(
            `${configKey}ForceSwitch`,
            () => `Force ${name} [${DataStore.get(configKey)?.force ? "ON" : "OFF"}]`,
            () => `Ignore team intent and force ${name} the selected champion`,
            [pluginGroup, configKey, "force", "switch"],
            pluginGroup,
            () => this.switchDataStore(configKey),
            {
                on: `Force ${name} is ON!`,
                off: `Force ${name} is OFF!`,
                error: `Failed to toggle Force ${name}. Check console.`
            }
        );
    }

    switchDataStore(configKey) {
        const config = DataStore.get(configKey);
        config.force = !config.force;
        DataStore.set(configKey, config);
        return config.force;
    }
}

export class RefreshDropdownsAction extends Action {
    constructor(dropdowns) {
        super(
            "RefreshDropdowns",
            () => "Refresh Dropdowns",
            () => "Normally dropdowns refresh automatically...",
            [pluginGroup, "refresh"],
            pluginGroup,
            () => this.refreshDropdowns(dropdowns),
            {
                success: "Refreshed Dropdowns!",
                error: "Failed to refresh Dropdowns. Check console."
            }
        )
    }

    refreshDropdowns(dropdowns) {
        for (let dropdown of dropdowns) {
            dropdown.refresh();
        }
    }
}

export class AutoPickSwitchAction extends FunctionSwitchAction {
    constructor(callback) {
        super(
            "Pick",
            "controladoPick",
            callback
        )
    }
}

export class AutoBanSwitchAction extends FunctionSwitchAction {
    constructor(callback) {
        super(
            "Ban",
            "controladoBan",
            callback
        );
    }
}

export class ForcePickSwitchAction extends ForceSwitchAction {
    constructor() {
        super("Pick", "controladoPick");
    }
}

export class ForceBanSwitchAction extends ForceSwitchAction {
    constructor() {
        super("Ban", "controladoBan");
    }
}

export function addActions(actions) {
    for (let action of actions) {
        CommandBar.addAction(action);
    }
}
