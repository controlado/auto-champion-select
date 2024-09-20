import { request, sleep } from "https://cdn.skypack.dev/balaclava-utils@latest";
import defaultPluginConfig from "./config.json";

/**
 * @author balaclava
 * @name auto-champion-select
 * @link https://github.com/controlado/auto-champion-select
 * @description Pick or ban automatically! 🐧
 */

export class ChampionSelect {
    constructor() {
        this.session = null;
        this.actions = null;

        this.localPlayerCellId = null;
        this.teamIntents = null;
        this.allPicks = null;
        this.allBans = null;

        this.mounted = false;
        this.watch();
    }

    mount() {
        this.mounted = true;
    }

    unmount() {
        this.mounted = false;
    }

    async watch() {
        while (true) {
            if (this.mounted) {
                await this.updateProperties();
                await this.task();
            }
            await sleep(300);
        }
    }

    async updateProperties() {
        const sessionResponse = await request("GET", "/lol-champ-select/v1/session");
        this.session = await sessionResponse.json();
        this.actions = this.session.actions;
        this.localPlayerCellId = this.session.localPlayerCellId;
        this.allPicks = [...this.session.myTeam, ...this.session.theirTeam];
        this.allBans = [...this.session.bans.myTeamBans, ...this.session.bans.theirTeamBans];
        this.teamIntents = this.session.myTeam.map(player => player.championPickIntent);
    }

    async task() {
        const pickConfig = DataStore.get("controladoPick") || defaultPluginConfig.controladoPick;
        const banConfig = DataStore.get("controladoBan") || defaultPluginConfig.controladoBan;

        if (!pickConfig.enabled && !banConfig.enabled) {
            return;
        }

        const localPlayerSubActions = this.getLocalPlayerSubActions();
        if (localPlayerSubActions.length === 0) {
            console.debug("auto-champion-select: No local player sub actions found, skipping...");
            this.unmount();
            return;
        }

        for (const subAction of localPlayerSubActions) {
            const config = subAction.type === "pick" ? pickConfig : banConfig;

            if (!config.enabled) {
                continue;
            }

            for (const championId of config.champions) {
                if (this.allBans.some(bannedChampionId => bannedChampionId == championId)) {
                    console.debug(`auto-champion-select: Banning ${championId} but it's already banned, skipping...`);
                    continue;
                }
                if (subAction.type === "ban" && this.teamIntents.some(playerIntent => playerIntent == championId)) {
                    console.debug(`auto-champion-select: Banning ${championId} but it's already picked, skipping...`);
                    continue;
                }
                if (subAction.type === "pick" && this.allPicks.some(player => player.championId == championId)) {
                    console.debug(`auto-champion-select: Picking ${championId} but it's already picked, skipping...`);
                    continue;
                }
                console.debug(`auto-champion-select: Trying to ${subAction.type} ${championId}...`);
                const response = await this.selectChampion(subAction.id, championId);
                if (response.ok) { console.debug("auto-champion-select: OK!"); return; }
            }
        }
    }

    getLocalPlayerSubActions() {
        return this.actions.flat().filter(subAction =>
            subAction.actorCellId === this.localPlayerCellId &&
            subAction.completed === false
        );
    }

    selectChampion(actionId, championId) {
        const endpoint = `/lol-champ-select/v1/session/actions/${actionId}`;
        const body = { championId: championId, completed: true };
        return request("PATCH", endpoint, { body });
    }
}

export class Dropdown {
    constructor(text, configKey, configIndex, championsFunction) {
        this.element = document.createElement("lol-uikit-framed-dropdown");
        this.element.classList.add("dropdown-champions-default");

        this.text = text;

        this.config = null;
        this.configKey = configKey;
        this.configIndex = configIndex;

        this.championsFunction = championsFunction;
        this.champions = null;
    }

    async setup() {
        this.champions = await this.championsFunction();
        this.config = DataStore.get(this.configKey) || defaultPluginConfig[this.configKey];

        if (!this.champions.some(champion => this.config.champions[this.configIndex] === champion.id)) {
            this.config.champions[this.configIndex] = this.champions[0].id;
            DataStore.set(this.configKey, this.config);
        }

        const alreadyAdded = [];
        for (const champion of this.champions) {
            if (alreadyAdded.includes(champion.name)) {
                continue;
            }
            alreadyAdded.push(champion.name);
            const option = this.getNewOption(champion);
            this.element.appendChild(option);
        }

        if (!this.element.shadowRoot.querySelector("#controlado-placeholder")) {
            const placeholderContainer = this.element.shadowRoot.querySelector(".ui-dropdown-current");
            const placeholder = this.getNewPlaceholder();
            placeholderContainer.appendChild(placeholder);
        }
    }

    getNewOption(champion) {
        const option = document.createElement("lol-uikit-dropdown-option");
        option.setAttribute("slot", "lol-uikit-dropdown-option");
        option.addEventListener("click", () => {
            this.config.champions[this.configIndex] = champion.id;
            DataStore.set(this.configKey, this.config);
        });

        if (this.config.champions[this.configIndex] === champion.id) {
            option.setAttribute("selected", "true");
        }

        option.innerText = champion.name;
        return option;
    }

    getNewPlaceholder() {
        const placeholder = document.createElement("div");
        placeholder.classList.add("ui-dropdown-current-content");
        placeholder.style.overflow = "visible";
        placeholder.id = "controlado-placeholder";
        placeholder.innerText = this.text;
        return placeholder;
    }

    refresh() {
        this.element.innerHTML = "";
        this.setup();
    }
}

export class Checkbox {
    constructor(text, configKey) {
        this.element = document.createElement("lol-uikit-radio-input-option");
        this.element.classList.add("lol-settings-voice-input-mode-option", "auto-select-checkbox");
        this.element.innerText = text;

        this.config = null;
        this.configKey = configKey;
    }

    setup() {
        this.config = DataStore.get(this.configKey) || defaultPluginConfig[this.configKey];

        if (this.config.enabled) {
            this.element.setAttribute("selected", "true");
        }

        this.element.addEventListener("click", () => this.toggle());
    }

    toggle() {
        console.debug("auto-champion-select: Toggling", this.configKey);
        this.config.enabled = !this.config.enabled;
        DataStore.set(this.configKey, this.config);
        this.element.toggleAttribute("selected");
        return this.config.enabled;
    }
}

export class SocialSection {
    constructor(label, ...hiddableElements) {
        this.element = document.createElement("lol-social-roster-group");
        this.element.addEventListener("post-render", () => this.onPostRender());
        this.element.addEventListener("click", () => this.onClick());

        this.label = label;
        this.hiddableElements = hiddableElements;

        this.waitRender();
    }

    waitRender() {
        new MutationObserver((_, observer) => {
            if (this.element.querySelector("span")) {
                const newEvent = new Event("post-render");
                this.element.dispatchEvent(newEvent);
                observer.disconnect();
            }
        }
        ).observe(this.element, { childList: true });
    }

    onPostRender() {
        this.element.querySelector("span").innerText = this.label;
        this.element.querySelector(".group-header").removeAttribute("graggable");
    }

    onClick() {
        this.hiddableElements.forEach(element => element.classList.toggle("hidden"));
        this.element.querySelector(".arrow").toggleAttribute("open");
    }
}