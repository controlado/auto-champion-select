import { request, sleep } from "https://cdn.jsdelivr.net/npm/balaclava-utils@latest";
import defaultPluginConfig from "./config.json";

const CHAMPION_SELECT_POSITIONS = [
    { value: "TOP", label: "Top", iconPath: "/fe/lol-parties/icon-position-top.png" },
    { value: "JUNGLE", label: "Jungle", iconPath: "/fe/lol-parties/icon-position-jungle.png" },
    { value: "MIDDLE", label: "Mid", iconPath: "/fe/lol-parties/icon-position-middle.png" },
    { value: "BOTTOM", label: "ADC", iconPath: "/fe/lol-parties/icon-position-bottom.png" },
    { value: "UTILITY", label: "Support", iconPath: "/fe/lol-parties/icon-position-utility.png" }
];
const CHAMPION_SELECT_POSITION_VALUES = new Set(CHAMPION_SELECT_POSITIONS.map(position => position.value));

function normalizeAssignedPosition(position) {
    const normalizedPosition = String(position ?? "").toUpperCase();
    return CHAMPION_SELECT_POSITION_VALUES.has(normalizedPosition) ? normalizedPosition : null;
}

function clonePositionsByChampionId(positionsByChampionId) {
    if (!positionsByChampionId || typeof positionsByChampionId !== "object" || Array.isArray(positionsByChampionId)) {
        return positionsByChampionId;
    }

    const clonedPositionsByChampionId = {};
    for (const [championId, allowedPositions] of Object.entries(positionsByChampionId)) {
        clonedPositionsByChampionId[championId] = Array.isArray(allowedPositions) ? [...allowedPositions] : allowedPositions;
    }

    return clonedPositionsByChampionId;
}

function cloneNormalizedPositionsByChampionId(positionsByChampionId) {
    const clonedPositionsByChampionId = {};

    for (const [championId, allowedPositions] of Object.entries(positionsByChampionId)) {
        clonedPositionsByChampionId[championId] = [...allowedPositions];
    }

    return clonedPositionsByChampionId;
}

function normalizePositionsByChampionId(positionsByChampionId, selectedChampionIds = null) {
    const normalizedPositionsByChampionId = {};

    if (!positionsByChampionId || typeof positionsByChampionId !== "object" || Array.isArray(positionsByChampionId)) {
        return normalizedPositionsByChampionId;
    }

    const selectedChampionIdKeys = selectedChampionIds
        ? new Set(selectedChampionIds.map(championId => String(championId)))
        : null;

    for (const [championIdKey, allowedPositions] of Object.entries(positionsByChampionId)) {
        const championId = Number(championIdKey);
        const normalizedChampionIdKey = String(championId);
        if (
            !Number.isFinite(championId) ||
            championId <= 0 ||
            (selectedChampionIdKeys && !selectedChampionIdKeys.has(normalizedChampionIdKey)) ||
            !Array.isArray(allowedPositions)
        ) {
            continue;
        }

        const normalizedAllowedPositions = [];
        const addedPositions = new Set();
        for (const position of allowedPositions) {
            const normalizedPosition = normalizeAssignedPosition(position);
            if (!normalizedPosition || addedPositions.has(normalizedPosition)) {
                continue;
            }

            normalizedAllowedPositions.push(normalizedPosition);
            addedPositions.add(normalizedPosition);
        }

        if (normalizedAllowedPositions.length > 0) {
            normalizedPositionsByChampionId[normalizedChampionIdKey] = normalizedAllowedPositions;
        }
    }

    return normalizedPositionsByChampionId;
}

function arePositionArraysEqual(currentPositions, normalizedPositions) {
    if (!Array.isArray(currentPositions) || !Array.isArray(normalizedPositions) || currentPositions.length !== normalizedPositions.length) {
        return false;
    }

    return currentPositions.every((position, index) => normalizeAssignedPosition(position) === normalizedPositions[index]);
}

function arePositionsByChampionIdEqual(currentPositionsByChampionId, normalizedPositionsByChampionId) {
    if (!currentPositionsByChampionId || typeof currentPositionsByChampionId !== "object" || Array.isArray(currentPositionsByChampionId)) {
        return Object.keys(normalizedPositionsByChampionId).length === 0;
    }

    const currentChampionIdKeys = Object.keys(currentPositionsByChampionId);
    const normalizedChampionIdKeys = Object.keys(normalizedPositionsByChampionId);
    if (currentChampionIdKeys.length !== normalizedChampionIdKeys.length) {
        return false;
    }

    return currentChampionIdKeys.every(championIdKey => {
        const championId = Number(championIdKey);
        const normalizedChampionIdKey = String(championId);
        return (
            normalizedChampionIdKey === championIdKey &&
            arePositionArraysEqual(
                currentPositionsByChampionId[championIdKey],
                normalizedPositionsByChampionId[normalizedChampionIdKey]
            )
        );
    });
}

function getAllowedPositionsForChampion(config, championId) {
    const normalizedChampionIdKey = String(Number(championId));
    const positionsByChampionId = normalizePositionsByChampionId(config?.positionsByChampionId);
    return positionsByChampionId[normalizedChampionIdKey] || [];
}

function isChampionAllowedForAssignedPosition(config, championId, assignedPosition) {
    const allowedPositions = getAllowedPositionsForChampion(config, championId);
    if (allowedPositions.length === 0) {
        return true;
    }

    const normalizedAssignedPosition = normalizeAssignedPosition(assignedPosition);
    return normalizedAssignedPosition !== null && allowedPositions.includes(normalizedAssignedPosition);
}

function getPositionMetadata(position) {
    return CHAMPION_SELECT_POSITIONS.find(positionMetadata => positionMetadata.value === position);
}

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
        this.localPlayerAssignedPosition = null;

        this.mounted = false;
        this.watchTask = null;
        this.watchVersion = 0;
    }

    mount() {
        if (this.mounted) {
            return;
        }
        this.mounted = true;
        this.watchVersion += 1;

        if (!this.watchTask) {
            this.watchTask = this.watch();
        }
    }

    unmount() {
        if (!this.mounted) {
            return;
        }
        this.mounted = false;
        this.watchVersion += 1;
    }

    async watch() {
        try {
            while (this.mounted) {
                const version = this.watchVersion;
                let updated = false;

                try {
                    await this.updateProperties();
                    updated = true;
                } catch (error) {
                    console.debug("auto-champion-select: Failed to update champion select", error);
                }

                if (!updated || !this.mounted || version !== this.watchVersion) {
                    if (this.mounted && version === this.watchVersion) {
                        await sleep(300);
                    }
                    continue;
                }

                try {
                    await this.task();
                } catch (error) {
                    console.debug("auto-champion-select: Failed to run champion select task", error);
                }

                if (this.mounted && version === this.watchVersion) {
                    await sleep(300);
                }
            }
        } finally {
            this.watchTask = null;
        }
    }

    async updateProperties() {
        const sessionResponse = await request("GET", "/lol-champ-select/v1/session");
        if (!sessionResponse.ok) {
            throw new Error(`Session request failed with status ${sessionResponse.status}`);
        }

        this.session = await sessionResponse.json();
        this.actions = this.session.actions;

        const completedActionBanChampionIds = this.actions.flat()
            .filter(action => action.type === "ban" && action.completed === true && action.championId > 0)
            .map(action => action.championId);

        this.localPlayerCellId = this.session.localPlayerCellId;
        const localPlayer = this.session.myTeam.find(player => player.cellId === this.localPlayerCellId);
        this.localPlayerAssignedPosition = normalizeAssignedPosition(localPlayer?.assignedPosition);

        this.allPicks = [...this.session.myTeam, ...this.session.theirTeam];
        this.allBans = [
            ...this.session.bans.myTeamBans,
            ...this.session.bans.theirTeamBans,
            ...completedActionBanChampionIds
        ];
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
            if (subAction.type !== "pick" && subAction.isInProgress !== true) {
                continue;
            }

            const config = subAction.type === "pick" ? pickConfig : banConfig;

            if (!config.enabled) {
                continue;
            }

            const championIds = Array.isArray(config.champions) ? config.champions : [];
            for (const championId of championIds) {
                if (this.shouldSkipChampion(subAction, championId, config)) {
                    continue;
                }

                console.debug(`auto-champion-select: Trying to ${subAction.type} ${championId}...`);
                const response = await this.selectChampion(subAction.id, championId);
                if (!response.ok) {
                    console.debug(`auto-champion-select: Failed to ${subAction.type} ${championId}, refreshing champ select state...`);

                    try {
                        await this.updateProperties();
                    } catch (error) {
                        console.debug("auto-champion-select: Failed to refresh champion select after select failure", error);
                        return;
                    }

                    const updatedSubAction = this.actions.flat().find(action =>
                        action.id === subAction.id &&
                        action.actorCellId === subAction.actorCellId &&
                        action.type === subAction.type &&
                        action.completed === false
                    );

                    // picks can run outside progress to set champion intent; other actions must be active.
                    if (!updatedSubAction || (updatedSubAction.type !== "pick" && updatedSubAction.isInProgress !== true)) {
                        return;
                    }

                    if (!this.shouldSkipChampion(updatedSubAction, championId, config)) {
                        return;
                    }

                    console.debug(`auto-champion-select: ${championId} is unavailable after refresh, trying next ${subAction.type}...`);
                    continue;
                }

                break;
            }
        }
    }

    shouldSkipChampion(subAction, championId, config) {
        if (subAction.type === "pick" && !isChampionAllowedForAssignedPosition(config, championId, this.localPlayerAssignedPosition)) {
            const allowedPositions = getAllowedPositionsForChampion(config, championId);
            if (this.localPlayerAssignedPosition) {
                console.debug(`auto-champion-select: Picking ${championId} but assigned position ${this.localPlayerAssignedPosition} is not in ${allowedPositions.join(", ")}, skipping...`);
            } else {
                console.debug(`auto-champion-select: Picking ${championId} but no assigned position is available for ${allowedPositions.join(", ")} restriction, skipping...`);
            }
            return true;
        }

        if (this.allBans.some(bannedChampionId => bannedChampionId == championId)) {
            console.debug(`auto-champion-select: Banning ${championId} but it's already banned, skipping...`);
            return true;
        }
        if (subAction.type === "ban" && this.teamIntents.some(playerIntent => playerIntent == championId)) {
            if (config.force === true) {
                console.debug(`auto-champion-select: Banning ${championId} but it's already picked, forcing...`);
            } else {
                console.debug(`auto-champion-select: Banning ${championId} but it's already picked, skipping...`);
                return true;
            }
        }
        if (subAction.type === "pick" && this.allPicks.some(player => player.championId == championId)) {
            if (config.force === true) {
                console.debug(`auto-champion-select: Picking ${championId} but it's already picked, forcing...`);
            } else {
                console.debug(`auto-champion-select: Picking ${championId} but it's already picked, skipping...`);
                return true;
            }
        }

        return false;
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

export class ChampionPrioritySelector {
    constructor(placeholderText, configKey, championsFunction, options = {}) {
        this.element = document.createElement("div");
        this.element.classList.add("champion-priority-selector");

        this.dropdownElement = document.createElement("lol-uikit-framed-dropdown");
        this.dropdownElement.classList.add(
            "dropdown-champions-default",
            "dropdown-drop-up",
            "champion-priority-selector__dropdown"
        );

        this.scrollElement = document.createElement("lol-uikit-scrollable");
        this.scrollElement.classList.add("champion-priority-selector__scroll");
        this.scrollElement.setAttribute("direction", "horizontal");
        this.scrollElement.setAttribute("overflow-masks", "disabled");
        this.scrollElement.setAttribute("side-scroll-wheel", "true");

        this.trackElement = document.createElement("div");
        this.trackElement.classList.add("champion-priority-selector__track");
        this.scrollElement.appendChild(this.trackElement);

        this.enablePositionRestrictions = options.enablePositionRestrictions === true;
        this.positionMenuElement = this.enablePositionRestrictions ? this.createPositionMenu() : null;
        this.positionMenuChampionId = null;
        this.positionsByChampionId = {};
        this.persistPositionRestrictions = false;

        this.emptyElement = document.createElement("div");
        this.emptyElement.classList.add("champion-priority-selector__empty");
        const emptyTitle = document.createElement("span");
        emptyTitle.innerText = "No champions";
        const emptyHint = document.createElement("span");
        const optionType = placeholderText.replace(/^Add\s+/i, "").toLowerCase();
        emptyHint.innerText = `Use dropdown to add ${optionType} option`;
        this.emptyElement.append(emptyTitle, emptyHint);

        this.element.append(this.dropdownElement, this.scrollElement);
        if (this.positionMenuElement) {
            this.element.appendChild(this.positionMenuElement);
        }

        this.placeholderText = placeholderText;
        this.placeholderOption = null;

        this.config = null;
        this.configKey = configKey;

        this.championsFunction = championsFunction;
        this.champions = [];
        this.championById = new Map();
        this.selectedChampionIds = [];
        this.iconButtons = new Map();

        this.dragState = null;
        this.handleWindowPointerMove = event => this.moveDrag(event);
        this.handleWindowPointerUp = event => this.finishDrag(event);
        this.handleWindowPointerCancel = event => this.cancelDrag(event);
        this.handlePositionMenuOutsidePointerDown = event => this.closePositionMenuOnOutsidePointerDown(event);
        this.handlePositionMenuKeyDown = event => this.closePositionMenuOnKeyDown(event);
        this.setupInFlight = null;
        this.setupPending = false;
    }

    async setup() {
        this.setupPending = true;

        if (!this.setupInFlight) {
            this.setupInFlight = this.runSetupLoop();
        }

        return this.setupInFlight;
    }

    async runSetupLoop() {
        try {
            while (this.setupPending) {
                this.setupPending = false;
                await this.performSetup();
            }
        } finally {
            this.setupInFlight = null;
        }

        if (this.setupPending) {
            return this.setup();
        }
    }

    async performSetup() {
        this.champions = this.normalizeChampions(await this.championsFunction());
        this.championById = new Map(this.champions.map(champion => [champion.id, champion]));
        this.config = this.getConfig();

        const normalizedChampionIds = this.normalizeChampionIds(this.config.champions);
        const configChanged = !this.areChampionIdsEqual(this.config.champions, normalizedChampionIds);
        this.selectedChampionIds = normalizedChampionIds;
        this.config.champions = [...this.selectedChampionIds];

        let positionConfigChanged = false;
        if (this.enablePositionRestrictions) {
            this.persistPositionRestrictions = Object.prototype.hasOwnProperty.call(this.config, "positionsByChampionId");
            const normalizedPositionsByChampionId = normalizePositionsByChampionId(
                this.config.positionsByChampionId,
                this.selectedChampionIds
            );
            positionConfigChanged = this.persistPositionRestrictions &&
                !arePositionsByChampionIdEqual(this.config.positionsByChampionId, normalizedPositionsByChampionId);
            this.positionsByChampionId = normalizedPositionsByChampionId;
            this.syncConfigPositionsByChampionId();
        }

        if (configChanged || positionConfigChanged) {
            this.saveConfig();
        }

        this.renderDropdownOptions();
        this.renderSelectedChampions();

        const root = await this.waitForDropdownRender();
        if (!root) {
            return;
        }

        this.ensureSearchPlaceholder(root);
        this.applyShadowStyles();
    }

    getConfig() {
        const defaultConfig = defaultPluginConfig[this.configKey];
        const config = DataStore.get(this.configKey) || defaultConfig;
        const clonedConfig = {
            ...config,
            champions: Array.isArray(config.champions) ? [...config.champions] : []
        };

        if (this.enablePositionRestrictions && Object.prototype.hasOwnProperty.call(config, "positionsByChampionId")) {
            clonedConfig.positionsByChampionId = clonePositionsByChampionId(config.positionsByChampionId);
        }

        return clonedConfig;
    }

    normalizeChampions(champions) {
        const normalizedChampions = [];
        const alreadyAdded = new Set();

        for (const champion of champions) {
            const championId = Number(champion.id);
            if (!Number.isFinite(championId) || championId <= 0 || !champion.name) {
                continue;
            }

            if (alreadyAdded.has(champion.name)) {
                continue;
            }

            normalizedChampions.push({
                ...champion,
                id: championId,
                squarePortraitPath: champion.squarePortraitPath || `/lol-game-data/assets/v1/champion-icons/${championId}.png`
            });
            alreadyAdded.add(champion.name);
        }

        return normalizedChampions;
    }

    normalizeChampionIds(championIds) {
        const normalizedChampionIds = [];
        const alreadyAdded = new Set();

        if (!Array.isArray(championIds)) {
            return normalizedChampionIds;
        }

        for (const championId of championIds) {
            const normalizedChampionId = Number(championId);
            if (
                !Number.isFinite(normalizedChampionId) ||
                alreadyAdded.has(normalizedChampionId) ||
                !this.championById.has(normalizedChampionId)
            ) {
                continue;
            }

            normalizedChampionIds.push(normalizedChampionId);
            alreadyAdded.add(normalizedChampionId);
        }

        return normalizedChampionIds;
    }

    areChampionIdsEqual(currentChampionIds, normalizedChampionIds) {
        if (!Array.isArray(currentChampionIds) || currentChampionIds.length !== normalizedChampionIds.length) {
            return false;
        }

        return currentChampionIds.every((championId, index) => Number(championId) === normalizedChampionIds[index]);
    }

    renderDropdownOptions() {
        this.dropdownElement.replaceChildren();

        this.placeholderOption = document.createElement("lol-uikit-dropdown-option");
        this.placeholderOption.setAttribute("slot", "lol-uikit-dropdown-option");
        this.placeholderOption.setAttribute("selected", "true");
        this.placeholderOption.innerText = this.placeholderText;
        this.dropdownElement.appendChild(this.placeholderOption);

        for (const champion of this.champions) {
            const option = this.getNewOption(champion);
            this.dropdownElement.appendChild(option);
        }
    }

    getNewOption(champion) {
        const option = document.createElement("lol-uikit-dropdown-option");
        option.setAttribute("slot", "lol-uikit-dropdown-option");
        option.addEventListener("click", () => {
            this.addChampion(champion.id);
            requestAnimationFrame(() => this.resetDropdown());
        });

        option.innerText = champion.name;
        return option;
    }

    addChampion(championId) {
        const normalizedChampionId = Number(championId);
        if (!this.championById.has(normalizedChampionId) || this.selectedChampionIds.includes(normalizedChampionId)) {
            return;
        }

        this.selectedChampionIds.push(normalizedChampionId);
        this.renderSelectedChampions();
        this.saveConfig();
    }

    removeChampion(championId) {
        const normalizedChampionId = Number(championId);
        const championIndex = this.selectedChampionIds.indexOf(normalizedChampionId);
        if (championIndex === -1) {
            return;
        }

        this.selectedChampionIds.splice(championIndex, 1);
        if (this.positionMenuChampionId === normalizedChampionId) {
            this.closePositionMenu();
        }

        if (this.enablePositionRestrictions && this.positionsByChampionId[String(normalizedChampionId)]) {
            delete this.positionsByChampionId[String(normalizedChampionId)];
            this.persistPositionRestrictions = true;
        }

        this.renderSelectedChampions();
        this.saveConfig();
    }

    moveChampionToIndex(championId, dropIndex) {
        const normalizedChampionId = Number(championId);
        const currentIndex = this.selectedChampionIds.indexOf(normalizedChampionId);
        if (currentIndex === -1) {
            return false;
        }

        const [movedChampionId] = this.selectedChampionIds.splice(currentIndex, 1);
        const boundedDropIndex = Math.max(0, Math.min(dropIndex, this.selectedChampionIds.length));
        this.selectedChampionIds.splice(boundedDropIndex, 0, movedChampionId);
        return currentIndex !== boundedDropIndex;
    }

    syncConfigPositionsByChampionId() {
        if (!this.enablePositionRestrictions) {
            return;
        }

        this.positionsByChampionId = normalizePositionsByChampionId(this.positionsByChampionId, this.selectedChampionIds);
        if (Object.keys(this.positionsByChampionId).length > 0) {
            this.persistPositionRestrictions = true;
        }

        if (this.persistPositionRestrictions) {
            this.config.positionsByChampionId = cloneNormalizedPositionsByChampionId(this.positionsByChampionId);
        } else {
            delete this.config.positionsByChampionId;
        }
    }

    saveConfig() {
        this.config.champions = [...this.selectedChampionIds];
        this.syncConfigPositionsByChampionId();
        DataStore.set(this.configKey, this.config);
        console.debug(this.configKey, DataStore.get(this.configKey));
    }

    renderSelectedChampions(previousPositions = null, draggedChampionId = null) {
        if (this.positionMenuChampionId !== null) {
            this.closePositionMenu();
        }

        const activeChampionIds = new Set(this.selectedChampionIds);

        for (const [championId, button] of this.iconButtons) {
            if (!activeChampionIds.has(championId)) {
                button.remove();
                this.iconButtons.delete(championId);
            }
        }

        if (this.selectedChampionIds.length === 0) {
            this.trackElement.replaceChildren(this.emptyElement);
            return;
        }

        this.emptyElement.remove();

        const orderedButtons = this.selectedChampionIds
            .map((championId, index) => this.getIconButton(championId, index))
            .filter(Boolean);

        this.trackElement.append(...orderedButtons);

        if (previousPositions) {
            this.animateReorder(previousPositions, draggedChampionId);
        }
    }

    getIconButton(championId, index) {
        const champion = this.championById.get(championId);
        if (!champion) {
            return null;
        }

        let button = this.iconButtons.get(championId);
        if (!button) {
            button = this.createIconButton(champion);
            this.iconButtons.set(championId, button);
        }

        button.dataset.rank = String(index + 1);
        const allowedPositionLabels = this.getChampionAllowedPositionLabels(championId);
        const positionText = allowedPositionLabels.length > 0 ? ` (${allowedPositionLabels.join(", ")})` : "";
        button.title = `${index + 1}. ${champion.name}${positionText}`;
        button.setAttribute("aria-label", `${index + 1}. ${champion.name}${positionText}`);

        const image = button.querySelector("img");
        image.src = champion.squarePortraitPath;
        image.alt = champion.name;

        const removeButton = button.querySelector(".champion-priority-selector__remove");
        removeButton.setAttribute("aria-label", `Remove ${champion.name}`);
        removeButton.title = `Remove ${champion.name}`;

        this.renderPositionBadge(button, championId);

        return button;
    }

    createIconButton(champion) {
        const button = document.createElement("div");
        button.classList.add("champion-priority-selector__icon");
        button.dataset.championId = String(champion.id);
        button.setAttribute("role", "button");
        button.tabIndex = 0;

        const image = document.createElement("img");
        image.draggable = false;

        const removeButton = document.createElement("button");
        removeButton.classList.add("champion-priority-selector__remove");
        removeButton.type = "button";
        removeButton.innerText = "x";
        removeButton.addEventListener("pointerdown", event => event.stopPropagation());
        removeButton.addEventListener("click", event => {
            event.stopPropagation();
            this.removeChampion(champion.id);
        });

        button.addEventListener("pointerdown", event => this.startDrag(event, champion.id));
        if (this.enablePositionRestrictions) {
            button.addEventListener("contextmenu", event => this.openPositionMenu(event, champion.id));
        }

        button.append(image, removeButton);
        return button;
    }

    createPositionMenu() {
        const menu = document.createElement("div");
        menu.classList.add("champion-priority-selector__position-menu");
        menu.hidden = true;

        for (const position of CHAMPION_SELECT_POSITIONS) {
            const button = document.createElement("button");
            button.classList.add("champion-priority-selector__position-option");
            button.type = "button";
            button.dataset.position = position.value;
            button.title = position.label;
            button.setAttribute("aria-label", position.label);
            button.setAttribute("aria-pressed", "false");
            button.addEventListener("pointerdown", event => event.stopPropagation());
            button.addEventListener("click", event => {
                event.stopPropagation();
                this.toggleChampionPosition(position.value);
            });

            const image = document.createElement("img");
            image.src = position.iconPath;
            image.alt = position.label;
            image.draggable = false;

            button.appendChild(image);
            menu.appendChild(button);
        }

        return menu;
    }

    getChampionAllowedPositions(championId) {
        return this.positionsByChampionId[String(Number(championId))] || [];
    }

    getChampionAllowedPositionLabels(championId) {
        return this.getChampionAllowedPositions(championId)
            .map(position => getPositionMetadata(position)?.label)
            .filter(Boolean);
    }

    renderPositionBadge(button, championId) {
        button.querySelector(".champion-priority-selector__position-badge")?.remove();
        if (!this.enablePositionRestrictions) {
            return;
        }

        const allowedPositions = this.getChampionAllowedPositions(championId);
        if (allowedPositions.length === 0) {
            return;
        }

        const firstPosition = getPositionMetadata(allowedPositions[0]);
        if (!firstPosition) {
            return;
        }

        const badge = document.createElement("span");
        badge.classList.add("champion-priority-selector__position-badge");
        badge.dataset.position = firstPosition.value;
        badge.title = this.getChampionAllowedPositionLabels(championId).join(", ");
        if (allowedPositions.length > 1) {
            badge.dataset.count = String(allowedPositions.length);
        }

        const image = document.createElement("img");
        image.src = firstPosition.iconPath;
        image.alt = firstPosition.label;
        image.draggable = false;

        badge.appendChild(image);
        button.appendChild(badge);
    }

    openPositionMenu(event, championId) {
        if (!this.enablePositionRestrictions || !this.positionMenuElement) {
            return;
        }

        const normalizedChampionId = Number(championId);
        if (!this.selectedChampionIds.includes(normalizedChampionId)) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        this.positionMenuChampionId = normalizedChampionId;
        this.renderPositionMenu();
        this.positionMenuElement.hidden = false;
        this.positionMenuElement.style.left = "0px";
        this.positionMenuElement.style.top = "0px";

        const menuRect = this.positionMenuElement.getBoundingClientRect();
        const margin = 8;
        const left = Math.min(
            Math.max(event.clientX, margin),
            window.innerWidth - menuRect.width - margin
        );
        const top = Math.min(
            Math.max(event.clientY, margin),
            window.innerHeight - menuRect.height - margin
        );

        this.positionMenuElement.style.left = `${left}px`;
        this.positionMenuElement.style.top = `${top}px`;
        document.addEventListener("pointerdown", this.handlePositionMenuOutsidePointerDown, true);
        document.addEventListener("keydown", this.handlePositionMenuKeyDown, true);
    }

    renderPositionMenu() {
        if (!this.positionMenuElement || this.positionMenuChampionId === null) {
            return;
        }

        const allowedPositions = new Set(this.getChampionAllowedPositions(this.positionMenuChampionId));
        this.positionMenuElement.querySelectorAll(".champion-priority-selector__position-option").forEach(button => {
            const selected = allowedPositions.has(button.dataset.position);
            button.classList.toggle("champion-priority-selector__position-option--selected", selected);
            button.setAttribute("aria-pressed", String(selected));
        });
    }

    toggleChampionPosition(position) {
        if (!this.enablePositionRestrictions || this.positionMenuChampionId === null) {
            return;
        }

        const normalizedPosition = normalizeAssignedPosition(position);
        if (!normalizedPosition) {
            return;
        }

        const championIdKey = String(this.positionMenuChampionId);
        const allowedPositions = new Set(this.positionsByChampionId[championIdKey] || []);
        if (allowedPositions.has(normalizedPosition)) {
            allowedPositions.delete(normalizedPosition);
        } else {
            allowedPositions.add(normalizedPosition);
        }

        const orderedAllowedPositions = CHAMPION_SELECT_POSITIONS
            .map(positionMetadata => positionMetadata.value)
            .filter(positionValue => allowedPositions.has(positionValue));

        if (orderedAllowedPositions.length > 0) {
            this.positionsByChampionId[championIdKey] = orderedAllowedPositions;
        } else {
            delete this.positionsByChampionId[championIdKey];
        }

        this.persistPositionRestrictions = true;
        this.renderPositionMenu();

        const iconButton = this.iconButtons.get(this.positionMenuChampionId);
        const iconIndex = this.selectedChampionIds.indexOf(this.positionMenuChampionId);
        if (iconButton && iconIndex !== -1) {
            this.getIconButton(this.positionMenuChampionId, iconIndex);
        }

        this.saveConfig();
    }

    closePositionMenuOnOutsidePointerDown(event) {
        if (this.positionMenuElement?.contains(event.target)) {
            return;
        }

        this.closePositionMenu();
    }

    closePositionMenuOnKeyDown(event) {
        if (event.key === "Escape") {
            this.closePositionMenu();
        }
    }

    closePositionMenu() {
        if (!this.positionMenuElement) {
            return;
        }

        this.positionMenuElement.hidden = true;
        this.positionMenuChampionId = null;
        document.removeEventListener("pointerdown", this.handlePositionMenuOutsidePointerDown, true);
        document.removeEventListener("keydown", this.handlePositionMenuKeyDown, true);
    }

    startDrag(event, championId) {
        if (event.button !== 0) {
            return;
        }

        if (this.dragState) {
            this.clearDragState();
        }

        const iconButton = this.iconButtons.get(championId);
        if (!iconButton) {
            return;
        }

        this.dragState = {
            championId,
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            active: false,
            moved: false
        };

        try {
            iconButton.setPointerCapture?.(event.pointerId);
        } catch { }

        window.addEventListener("pointermove", this.handleWindowPointerMove);
        window.addEventListener("pointerup", this.handleWindowPointerUp);
        window.addEventListener("pointercancel", this.handleWindowPointerCancel);
    }

    moveDrag(event) {
        if (!this.dragState || this.dragState.pointerId !== event.pointerId) {
            return;
        }

        const championId = this.dragState.championId;
        const deltaX = event.clientX - this.dragState.startX;
        const deltaY = event.clientY - this.dragState.startY;
        const movement = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

        if (!this.dragState.active) {
            if (movement < 5) {
                return;
            }

            this.dragState.active = true;
            this.iconButtons.get(championId)?.classList.add("champion-priority-selector__icon--dragging");
        }

        event.preventDefault();

        const dropIndex = this.getDropIndex(event.clientX, championId);
        const currentIndex = this.selectedChampionIds.indexOf(championId);
        if (dropIndex === currentIndex || dropIndex === -1) {
            return;
        }

        const previousPositions = this.getIconPositions();
        if (this.moveChampionToIndex(championId, dropIndex)) {
            this.dragState.moved = true;
            this.renderSelectedChampions(previousPositions, championId);
        }
    }

    finishDrag(event) {
        if (!this.dragState || this.dragState.pointerId !== event.pointerId) {
            return;
        }

        const dragWasActive = this.dragState.active;
        const dragMoved = this.dragState.moved;
        this.clearDragState();

        if (dragWasActive && dragMoved) {
            this.saveConfig();
        }
    }

    cancelDrag(event) {
        if (!this.dragState || this.dragState.pointerId !== event.pointerId) {
            return;
        }

        this.clearDragState();
    }

    clearDragState() {
        if (!this.dragState) {
            return;
        }

        const { championId, pointerId } = this.dragState;
        const iconButton = this.iconButtons.get(championId);
        iconButton?.classList.remove("champion-priority-selector__icon--dragging");
        try { iconButton?.releasePointerCapture?.(pointerId); } catch { }
        window.removeEventListener("pointermove", this.handleWindowPointerMove);
        window.removeEventListener("pointerup", this.handleWindowPointerUp);
        window.removeEventListener("pointercancel", this.handleWindowPointerCancel);
        this.dragState = null;
    }

    getDropIndex(clientX, draggedChampionId) {
        const championIdsWithoutDragged = this.selectedChampionIds.filter(championId => championId !== draggedChampionId);

        for (let index = 0; index < championIdsWithoutDragged.length; index++) {
            const iconButton = this.iconButtons.get(championIdsWithoutDragged[index]);
            if (!iconButton) {
                continue;
            }

            const rect = iconButton.getBoundingClientRect();
            if (clientX < rect.left + rect.width / 2) {
                return index;
            }
        }

        return championIdsWithoutDragged.length;
    }

    getIconPositions() {
        const positions = new Map();
        for (const championId of this.selectedChampionIds) {
            const iconButton = this.iconButtons.get(championId);
            if (iconButton) {
                positions.set(championId, iconButton.getBoundingClientRect());
            }
        }

        return positions;
    }

    animateReorder(previousPositions, draggedChampionId) {
        for (const championId of this.selectedChampionIds) {
            if (championId === draggedChampionId) {
                continue;
            }

            const iconButton = this.iconButtons.get(championId);
            const previousPosition = previousPositions.get(championId);
            if (!iconButton || !previousPosition || typeof iconButton.animate !== "function") {
                continue;
            }

            const currentPosition = iconButton.getBoundingClientRect();
            const deltaX = previousPosition.left - currentPosition.left;
            const deltaY = previousPosition.top - currentPosition.top;
            if (deltaX === 0 && deltaY === 0) {
                continue;
            }

            iconButton.animate(
                [
                    { transform: `translate(${deltaX}px, ${deltaY}px)` },
                    { transform: "translate(0, 0)" }
                ],
                {
                    duration: 150,
                    easing: "cubic-bezier(0.2, 0, 0, 1)"
                }
            );
        }
    }

    getNewPlaceholder() {
        const placeholder = document.createElement("div");
        placeholder.classList.add("controlado-tag", "controlado-tag--search");
        placeholder.id = "controlado-placeholder";

        const input = document.createElement("input");
        input.classList.add("controlado-filter-input");
        input.id = "controlado-search";
        input.type = "text";
        input.placeholder = "Search";

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

    async waitForDropdownRender() {
        for (let attempt = 0; attempt < 50; attempt++) {
            const root = this.dropdownElement.shadowRoot;
            if (this.dropdownElement.isConnected && root?.querySelector(".ui-dropdown-current")) {
                return root;
            }

            await sleep(100);
        }

        return null;
    }

    ensureSearchPlaceholder(root) {
        if (root.querySelector("#controlado-placeholder")) {
            return;
        }

        const placeholderContainer = root.querySelector(".ui-dropdown-current");
        if (!placeholderContainer) {
            return;
        }

        placeholderContainer.style = "display: flex; justify-content: space-between;";
        placeholderContainer.appendChild(this.getNewPlaceholder());
    }

    resetDropdown() {
        this.dropdownElement.querySelectorAll("lol-uikit-dropdown-option[selected]").forEach(option => {
            option.removeAttribute("selected");
        });
        this.placeholderOption?.setAttribute("selected", "true");

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

            if (this.isOpen()) {
                root.querySelector(".ui-dropdown-current")?.click();
            }
        });
    }

    filterOptions(query) {
        const normalizedQuery = query.toLowerCase();
        const options = this.dropdownElement.querySelectorAll("lol-uikit-dropdown-option");
        options.forEach(option => {
            if ((option.textContent ?? "").toLowerCase().includes(normalizedQuery)) {
                option.style.display = "";
            } else {
                option.style.display = "none";
            }
        });
    }

    refresh() {
        return this.setup();
    }

    isOpen() {
        return this.dropdownElement.classList.contains("active");
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
        const root = this.dropdownElement.shadowRoot;
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
        if (element.querySelector("style[data-controlado='dropdown-tags']")) {
            return;
        }

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
                text-align: left;
                outline: none;
                font-family: inherit;
                font-size: inherit;
                font-weight: inherit;
                width: 64px;
            }

            .controlado-tag {
                cursor: default;
                display: inline-flex;
                align-items: center;
                gap: 4px;
                padding: 2px 10px;
                border-radius: 999px;
                border: 1px solid #c8aa6e;
                background: #0f1b2d;
                color: #f3d7a5;
                font-size: 11px;
                font-weight: 600;
                letter-spacing: 0;
                text-transform: uppercase;
                white-space: nowrap;
                box-shadow: inset 0 0 8px rgba(15, 30, 45, 0.6);
            }

            .controlado-tag--search {
                border-color: #d7b46a;
                color: #f6e1b2;
                background: #1a232f;
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

export class ChampionSelectMenu {
    constructor(label, restoreControls, ...controlElements) {
        this.element = document.createElement("div");
        this.element.classList.add("auto-select-champ-select-menu", "auto-select-champ-select-menu--collapsed");

        this.buttonWrapper = document.createElement("div");
        this.buttonWrapper.classList.add("auto-select-champ-select-menu-button-wrapper");

        this.headerElement = document.createElement("button");
        this.headerElement.classList.add("auto-select-champ-select-menu__header");
        this.headerElement.type = "button";
        this.headerElement.setAttribute("aria-label", label);
        this.headerElement.setAttribute("aria-expanded", "false");
        this.headerElement.addEventListener("click", () => this.toggle());

        this.contentElement = document.createElement("div");
        this.contentElement.classList.add("auto-select-champ-select-menu__content");

        this.titleElement = document.createElement("div");
        this.titleElement.classList.add("auto-select-champ-select-menu__title");
        this.titleElement.textContent = label;

        this.buttonWrapper.append(this.headerElement, this.element);
        this.contentElement.appendChild(this.titleElement);
        this.element.appendChild(this.contentElement);

        this.restoreControls = restoreControls;
        this.controlElements = controlElements;
        this.boundCloseOnOutsideInteraction = (event) => this.closeOnOutsideInteraction(event);
        this.buttonObserver = null;
        this.buttonMountFrame = null;
        this.buttonMountTask = null;
        this.hiddenStates = new WeakMap();
        this.mounted = false;
    }

    async mount() {
        if (this.mounted) {
            return this.mountButton();
        }
        this.mounted = true;

        this.controlElements.forEach(element => {
            this.hiddenStates.set(element, element.classList.contains("hidden"));
            element.classList.remove("hidden");
            this.contentElement.appendChild(element);
        });

        this.observeButtonContainer();

        document.addEventListener("pointerdown", this.boundCloseOnOutsideInteraction, true);

        return this.mountButton();
    }

    unmount() {
        if (!this.mounted) {
            return this.restoreControls();
        }
        this.mounted = false;

        this.buttonObserver?.disconnect();
        this.buttonObserver = null;
        if (this.buttonMountFrame !== null) {
            cancelAnimationFrame(this.buttonMountFrame);
            this.buttonMountFrame = null;
        }
        this.buttonMountTask = null;

        document.removeEventListener("pointerdown", this.boundCloseOnOutsideInteraction, true);

        this.setOpen(false);
        this.buttonWrapper.remove();
        this.restoreHiddenStates();

        return this.restoreControls();
    }

    isOpen() {
        return !this.element.classList.contains("auto-select-champ-select-menu--collapsed");
    }

    setOpen(open) {
        this.element.classList.toggle("auto-select-champ-select-menu--collapsed", !open);
        this.buttonWrapper.classList.toggle("auto-select-champ-select-menu-button-wrapper--open", open);
        this.headerElement.setAttribute("aria-expanded", String(open));
    }

    toggle() {
        this.setOpen(!this.isOpen());
    }

    closeOnOutsideInteraction(event) {
        if (!this.isOpen()) {
            return;
        }

        const path = typeof event.composedPath === "function" ? event.composedPath() : [];
        const clickedInsideMenu = path.includes(this.buttonWrapper) || this.buttonWrapper.contains(event.target);

        if (!clickedInsideMenu) {
            this.setOpen(false);
        }
    }

    observeButtonContainer() {
        this.buttonObserver = new MutationObserver(() => this.scheduleMountButton());
        this.buttonObserver.observe(document.body, { childList: true, subtree: true });
    }

    scheduleMountButton() {
        if (this.buttonMountFrame !== null) {
            return;
        }

        this.buttonMountFrame = requestAnimationFrame(() => {
            this.buttonMountFrame = null;
            this.mountButton();
        });
    }

    mountButton() {
        if (!this.buttonMountTask) {
            this.buttonMountTask = this.appendButtonToContainer()
                .finally(() => {
                    this.buttonMountTask = null;
                });
        }

        return this.buttonMountTask;
    }

    async appendButtonToContainer() {
        let buttonContainer = document.querySelector(".bottom-right-buttons");
        while (this.mounted && !buttonContainer) {
            await sleep(200);
            buttonContainer = document.querySelector(".bottom-right-buttons");
        }

        if (!this.mounted) {
            return; // stop after champion select closes while waiting for native buttons
        }

        if (!buttonContainer) {
            return; // avoid querySelector when native buttons did not render
        }

        const firstSquareButton = buttonContainer.querySelector(
            "lol-social-chat-toggle-button, .missions-tracker-button-component, .champ-select-voice-button-wrapper"
        );

        if (this.buttonWrapper.parentNode === buttonContainer && this.buttonWrapper.nextSibling === firstSquareButton) {
            return;
        }

        buttonContainer.insertBefore(this.buttonWrapper, firstSquareButton);
    }

    restoreHiddenStates() {
        this.controlElements.forEach(element => {
            element.classList.toggle("hidden", this.hiddenStates.get(element) === true);
            this.hiddenStates.delete(element);
        });
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
        this.hiddableElements.forEach(element => {
            if (!element.closest(".auto-select-champ-select-menu")) {
                element.classList.toggle("hidden");
            }
        });
        this.element.querySelector(".arrow").toggleAttribute("open");
    }
}
