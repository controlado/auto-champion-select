import { request, sleep } from "https://cdn.jsdelivr.net/npm/balaclava-utils@latest";
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
                    if (config.force === true) {
                        console.debug(`auto-champion-select: Banning ${championId} but it's already picked, forcing...`);
                    } else {
                        console.debug(`auto-champion-select: Banning ${championId} but it's already picked, skipping...`);
                        continue;
                    }
                }
                if (subAction.type === "pick" && this.allPicks.some(player => player.championId == championId)) {
                    if (config.force === true) {
                        console.debug(`auto-champion-select: Picking ${championId} but it's already picked, forcing...`);
                    } else {
                        console.debug(`auto-champion-select: Picking ${championId} but it's already picked, skipping...`);
                        continue;
                    }
                }
                console.debug(`auto-champion-select: Trying to ${subAction.type} ${championId}...`);
                const response = await this.selectChampion(subAction.id, championId);
                if (!response.ok) { return; }
                else { break; }
            }
        }
    }

    getLocalPlayerSubActions() {
        return this.actions.flat().filter(subAction =>
            subAction.actorCellId === this.localPlayerCellId &&
            subAction.completed === false
        ).sort(
            (a, b) => {
                const aPriority = a.type === "pick" ? 0 : 1;
                const bPriority = b.type === "pick" ? 0 : 1;
                return aPriority - bPriority;
            }
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
            placeholderContainer.innerHTML = ""; // Clear default content
            placeholderContainer.style = "display: flex; justify-content: space-between; align-items: center;";
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
            const input = this.element.shadowRoot.querySelector("#controlado-search");
            if (input) {
                input.value = "";
                this.filterOptions("");
            }
            this.updatePlaceholder();
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
        placeholder.id = "controlado-placeholder";
        placeholder.style = "display: flex; align-items: center; gap: 12px; width: 100%;";

        // Get selected champion name and create label
        const selectedId = this.config.champions[this.configIndex];
        const selectedChampion = this.champions.find(c => c.id === selectedId);
        const championName = selectedChampion ? selectedChampion.name : "Select Champion";
        
        // Determine if it's Pick or Ban and create ordinal label
        const isPick = this.configKey.includes("Pick");
        const action = isPick ? "Pick" : "Ban";
        const ordinal = this.configIndex + 1; // Convert 0-indexed to 1-indexed

        // Create left label container
        const labelContainer = document.createElement("div");
        labelContainer.id = "controlado-label-container";
        labelContainer.style = "display: flex; flex-direction: column; gap: 2px; flex-shrink: 0;";

        const actionLabel = document.createElement("div");
        actionLabel.id = "controlado-action-label";
        actionLabel.style = "color: #c89b3c; font-size: 12px; font-weight: 500;";
        actionLabel.textContent = `${action} ${ordinal}`;

        const championLabel = document.createElement("div");
        championLabel.id = "controlado-champion-label";
        championLabel.style = "color: inherit; font-size: 14px; font-weight: 500;";
        championLabel.textContent = championName;

        labelContainer.appendChild(actionLabel);
        labelContainer.appendChild(championLabel);

        const input = document.createElement("input");
        input.id = "controlado-search";
        input.type = "text";
        input.placeholder = "Search...";
        input.style = "flex: 1; padding: 4px 8px; color: inherit; background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 4px; outline: none; font-family: inherit; font-size: inherit; font-weight: inherit; transition: all 0.2s ease;";
        input.addEventListener("input", (e) => this.filterOptions(e.target.value));
        input.addEventListener("focus", (e) => {
            e.target.style.background = "rgba(255, 255, 255, 0.15)";
            e.target.style.borderColor = "rgba(255, 255, 255, 0.4)";
        });
        input.addEventListener("blur", (e) => {
            e.target.style.background = "rgba(255, 255, 255, 0.1)";
            e.target.style.borderColor = "rgba(255, 255, 255, 0.2)";
        });

        placeholder.appendChild(labelContainer);
        placeholder.appendChild(input);
        return placeholder;
    }

    updatePlaceholder() {
        const placeholderElement = this.element.shadowRoot.querySelector("#controlado-placeholder");
        if (placeholderElement) {
            const selectedId = this.config.champions[this.configIndex];
            const selectedChampion = this.champions.find(c => c.id === selectedId);
            const championName = selectedChampion ? selectedChampion.name : "Select Champion";
            
            const championLabel = placeholderElement.querySelector("#controlado-champion-label");
            if (championLabel) {
                championLabel.textContent = championName;
            }
        }
    }

    filterOptions(query) {
        const options = this.element.querySelectorAll("lol-uikit-dropdown-option");
        const normalizedQuery = query.toLowerCase().trim();

        if (!normalizedQuery) {
            options.forEach(option => option.style.display = "");
            return options.length;
        }

        options.forEach(option => {
            const optionText = option.innerText.toLowerCase();
            // Show option if query is empty or option text includes the query
            const isMatch = optionText.includes(normalizedQuery);

            if (isMatch) {
                option.style.display = "";
                visibleCount += 1;
            } else {
                option.style.display = "none";
            }

        });

        return visibleCount;
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