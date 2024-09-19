const pluginGroup = "Balaclava: Auto Champion Select";

class SwitchAction {
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
        try {
            const currentStatus = this.callback();
            Toast.success(currentStatus ? this.toasts.on : this.toasts.off);
        } catch (error) {
            Toast.error(this.toasts.error);
            console.error(error);
        }
    }
}

export class AutoPickSwitchAction extends SwitchAction {
    constructor(callback) {
        super(
            "controladoPickSwitch",
            "Auto Pick [ON/OFF]",
            "Turn the auto pick ON/OFF",
            [pluginGroup, "pick", "switch"],
            pluginGroup,
            callback,
            {
                on: "Auto Pick is ON",
                off: "Auto Pick is OFF",
                error: "Failed to toggle Auto Pick. Check console."
            }
        )
    }
}

export class AutoBanSwitchAction extends SwitchAction {
    constructor(callback) {
        super(
            "controladoBanSwitch",
            "Auto Ban [ON/OFF]",
            "Turn the auto ban ON/OFF",
            [pluginGroup, "ban", "switch"],
            pluginGroup,
            callback,
            {
                on: "Auto Ban is ON",
                off: "Auto Ban is OFF",
                error: "Failed to toggle Auto Ban. Check console."
            }
        );
    }
}

export function addActions(actions) {
    for (let action of actions) {
        CommandBar.addAction(action);
    }
}
