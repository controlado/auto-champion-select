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
        this.element.classList.add("dropdown-drop-up");

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

        this.shadowRoot((root) => {
            if (!root.querySelector("#controlado-placeholder")) {
                const placeholderContainer = root.querySelector(".ui-dropdown-current");
                placeholderContainer.style = "display: flex; justify-content: space-between;";

                const placeholder = this.getNewPlaceholder();
                placeholderContainer.appendChild(placeholder);
            }
        });

        this.applyShadowStyles();
    }

    getNewOption(champion) {
        const option = document.createElement("lol-uikit-dropdown-option");
        option.setAttribute("slot", "lol-uikit-dropdown-option");
        option.addEventListener("click", () => {
            this.config.champions[this.configIndex] = champion.id;
            DataStore.set(this.configKey, this.config);
            console.debug(this.configKey, DataStore.get(this.configKey));

            this.shadowRoot((root) => {
                const input = root.querySelector("#controlado-search");
                if (input) {
                    input.value = "";
                    this.filterOptions("");
                }

                const trashFilterIcon = root.querySelector(".controlado-filter-icon--trash");
                if (trashFilterIcon) {
                    trashFilterIcon.classList.remove("controlado-filter-icon--trash");
                }
            });
        });

        if (this.config.champions[this.configIndex] === champion.id) {
            option.setAttribute("selected", "true");
        }

        option.innerText = champion.name;
        return option;
    }

    getNewPlaceholder() {
        const placeholder = document.createElement("div");
        placeholder.classList.add("controlado-tag", "controlado-tag--search");
        placeholder.id = "controlado-placeholder";

        const input = document.createElement("input");
        input.classList.add("controlado-filter-input");
        input.id = "controlado-search";
        input.type = "text";
        input.placeholder = this.text;

        const filterIcon = document.createElement("span");
        filterIcon.classList.add("controlado-filter-icon");

        filterIcon.addEventListener("click", (_) => {
            const filterIconIsTrash = filterIcon.classList.contains("controlado-filter-icon--trash");
            if (!filterIconIsTrash) {
                return;
            }

            input.value = "";
            this.filterOptions("");
            filterIcon.classList.toggle("controlado-filter-icon--trash", false);
        });

        input.addEventListener("input", (e) => {
            this.ensureIsOpened();
            this.filterOptions(e.target.value);
            filterIcon.classList.toggle("controlado-filter-icon--trash", Boolean(e.target.value));
        });

        ["pointerdown", "click"].forEach((type) => {
            placeholder.addEventListener(type, (e) => e.stopPropagation());
            filterIcon.addEventListener(type, (e) => e.stopPropagation());
        });

        ["pointerdown", "focusin"].forEach((type) => {
            input.addEventListener(type, (e) => e.stopPropagation(), true);
        });

        placeholder.appendChild(filterIcon);
        placeholder.appendChild(input);
        return placeholder;
    }

    filterOptions(query) {
        const options = this.element.querySelectorAll("lol-uikit-dropdown-option");
        options.forEach(option => {
            if (option.innerText.toLowerCase().includes(query.toLowerCase())) {
                option.style.display = "";
            } else {
                option.style.display = "none";
            }
        });
    }

    refresh() {
        this.element.innerHTML = "";
        this.setup();
    }

    isOpen() {
        return this.element.classList.contains("active");
    }

    ensureIsOpened() {
        if (this.isOpen()) {
            return;
        }

        this.shadowRoot((root) => {
            const internalDropdown = root.querySelector(".ui-dropdown-current");
            if (internalDropdown) {
                internalDropdown.click();
            }
        });
    }

    /**
     * @param {(root: ShadowRoot) => void} fn 
     * @returns {void}
     */
    shadowRoot(fn) {
        const root = this.element.shadowRoot;
        if (!root) {
            return;
        }
        fn(root);
    }

    applyShadowStyles() {
        this.shadowRoot((root) => {
            this.injectTagStyles(root);

            const currentDropdown = root.querySelector(".ui-dropdown-current");
            if (currentDropdown) {
                currentDropdown.style.paddingRight = "28px";
            }

            const dropdownMenu = root.querySelector(".ui-dropdown-options-container");
            if (dropdownMenu) {
                dropdownMenu.style.top = "auto";
                dropdownMenu.style.bottom = "100%";
                dropdownMenu.style.transformOrigin = "bottom";
                dropdownMenu.style.transform = "translateY(0)";
            }

            const scrollableOptions = root.querySelector("lol-uikit-scrollable");
            if (scrollableOptions) {
                scrollableOptions.style.maxHeight = "250px";
            }
        });
    }

    injectTagStyles(element) {
        const style = document.createElement("style");
        style.dataset.controlado = "dropdown-tags";
        style.textContent = `
            .controlado-filter-icon {
                cursor: default;
                display: inline-block;
                width: 18px;
                height: 18px;
                background-color: #c8aa6e;
                -webkit-mask-image: url('/fe/lol-social/search_mask.png');
                -webkit-mask-repeat: no-repeat;
                -webkit-mask-position: center;
                -webkit-mask-size: 18px 18px;
            }

            .controlado-filter-icon--trash {
                cursor: pointer;
                background-color: #c86e6e;
                -webkit-mask-image: url('/fe/lol-uikit/images/icon_delete.png');
                -webkit-mask-size: 12px 12px;
            }

            .controlado-filter-input {
                color: inherit;
                background: transparent;
                border: none;
                text-align: center;
                outline: none;
                font-family: inherit;
                font-size: inherit;
                font-weight: inherit;
                width: 40px;
            }

            .controlado-tag {
                cursor: default;
                display: inline-flex;
                align-items: center;
                gap: 4px;
                padding: 2px 10px;
                border-radius: 999px;
                border: 1px solid #c8aa6e;
                background: linear-gradient(145deg, #0f1b2d, #0a121a);
                color: #f3d7a5;
                font-size: 11px;
                font-weight: 600;
                letter-spacing: 0.4px;
                text-transform: uppercase;
                white-space: nowrap;
                box-shadow: inset 0 0 8px rgba(15, 30, 45, 0.6);
            }

            .controlado-tag--search {
                border-color: #d7b46a;
                color: #f6e1b2;
                background: linear-gradient(145deg, #1a232f, #0f1722);
                text-transform: none;
                font-weight: 500;
            }
        `;
        element.appendChild(style);
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