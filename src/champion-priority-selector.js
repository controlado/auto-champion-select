import { toChampionId } from "./champion-ids.js";
import { ensureConfig, patchConfig } from "./config-store.js";
import { getPositionMetadata, normalizePosition, normalizePositionList, normalizePositionsByChampionId, POSITIONS } from "./champion-positions.js";
import {
    BRAVERY_CHAMPION_OPTION,
    getChampionIdsFromPriorityOptions,
    isBraveryChampionOption,
    isRandomChampionOption,
    normalizeChampionPriorityOptions,
    RANDOM_CHAMPION_OPTION,
    toChampionPriorityOption,
    toChampionPriorityOptionKey
} from "./champion-priority-options.js";
import { ChampionDropdown } from "./champion-dropdown.js";
import { LEAGUE_CLIENT_ELEMENTS } from "./league-client-dom.js";

/**
 * @typedef {{id: number, name: string, squarePortraitPath: string}} Champion
 *
 * @typedef {Object} ChampionPrioritySelectorOptions
 * @property {boolean} [enablePositionRestrictions] Enables the right-click per-position restriction menu.
 * @property {boolean} [enableRandomAssignedPositionRestrictions] Enables the assigned-position gate for the Random pick option.
 * @property {boolean} [enableRandomPoolPositionFilters] Enables the per-random pool position filter menu.
 * @property {boolean} [enableBraveryOption] Enables the Bravery pick option.
 * @property {string} [searchPlaceholderText] Search input placeholder shown inside the dropdown control.
 * @property {string} [quickActionLabel] Tooltip and accessibility label for the quick action toggle.
 * @property {string} [randomOptionDescription] Short secondary text for the Random dropdown option.
 *
 * @typedef {Object} ChampionPrioritySelectorConfig
 * @property {boolean} enabled
 * @property {boolean} [force]
 * @property {boolean} [quickAction]
 * @property {number[]} [champions]
 * @property {import("./champion-priority-options.js").ChampionPriorityOption[]} [priorityOptions]
 * @property {string[]} [randomAssignedPositions]
 * @property {string[]} [randomPoolPositions]
 * @property {Record<string, string[]>} [positionsByChampionId]
 *
 * @typedef {Object} SelectedChampionsScrollElements
 * @property {HTMLElement} scrollElement League client UI horizontal scrollable custom element.
 * @property {HTMLDivElement} trackElement Element that owns the selected champion icons.
 *
 * @typedef {Object} DragState
 * @property {import("./champion-priority-options.js").ChampionPriorityOption} option
 * @property {number} pointerId
 * @property {number} startX
 * @property {number} startY
 * @property {boolean} active
 * @property {boolean} moved
 *
 * @typedef {"champion-assigned" | "random-assigned" | "random-pool"} PositionMenuTargetKind
 *
 * @typedef {Object} PositionMenuTarget
 * @property {import("./champion-priority-options.js").ChampionPriorityOption} option
 * @property {PositionMenuTargetKind} kind
 */

const POSITION_BADGE_SELECTOR = ".champion-priority-selector__position-badge";
const POSITION_OPTION_SELECTOR = ".champion-priority-selector__position-option";
const REMOVE_BUTTON_SELECTOR = ".champion-priority-selector__remove";

const REMOVE_ICON_TEXT = "\u2715";

const RANDOM_ICON_TEXT = "?";
const RANDOM_OPTION_LABEL = "Random";

const BRAVERY_OPTION_LABEL = "Bravery";
const BRAVERY_OPTION_DESCRIPTION = "For Arena mode.";
const BRAVERY_OPTION_ICON_PATH = "/fe/lol-champ-select/images/champion-grid/bravery-champion.png";
const BRAVERY_DROPDOWN_ICON_CLASS = "controlado-champion-option__icon--bravery";
const BRAVERY_SELECTED_ICON_CLASS = "champion-priority-selector__icon--bravery";

const PRIMARY_MOUSE_BUTTON = 0;
const MIDDLE_MOUSE_BUTTON = 1;

const POSITION_MENU_VIEWPORT_MARGIN_PX = 8;

const POSITION_MENU_TARGET_KIND = Object.freeze({
    CHAMPION_ASSIGNED: "champion-assigned",
    RANDOM_ASSIGNED: "random-assigned",
    RANDOM_POOL: "random-pool"
});

const DRAG_ACTIVATION_DISTANCE_PX = 5;
const REORDER_ANIMATION_DURATION_MS = 150;
const REORDER_ANIMATION_EASING = "cubic-bezier(0.2, 0, 0, 1)";

export class ChampionPrioritySelector {
    /**
     * @param {string} placeholderText
     * @param {"controladoPick" | "controladoBan"} configKey
     * @param {() => Promise<Champion[]>} loadChampions
     * @param {ChampionPrioritySelectorOptions} [options]
     */
    constructor(placeholderText, configKey, loadChampions, options = {}) {
        this.element = this.createRootElement();
        this.dropdownElement = this.createDropdownElement();

        const staticOptions = [{
            value: RANDOM_CHAMPION_OPTION,
            label: RANDOM_OPTION_LABEL,
            description: options.randomOptionDescription,
            iconText: RANDOM_ICON_TEXT
        }];

        if (options.enableBraveryOption === true) {
            staticOptions.push({
                value: BRAVERY_CHAMPION_OPTION,
                label: BRAVERY_OPTION_LABEL,
                description: BRAVERY_OPTION_DESCRIPTION,
                iconPath: BRAVERY_OPTION_ICON_PATH,
                iconClass: BRAVERY_DROPDOWN_ICON_CLASS
            });
        }

        this.championDropdown = new ChampionDropdown(
            this.dropdownElement,
            placeholderText,
            option => this.addPriorityOption(option),
            {
                quickActionLabel: options.quickActionLabel,
                searchPlaceholderText: options.searchPlaceholderText,
                staticOptions,
                isQuickActionEnabled: () => this.isQuickActionEnabled(),
                onQuickActionToggle: () => this.toggleQuickAction()
            }
        );

        const { scrollElement, trackElement } = this.createSelectedChampionsScroll();
        this.scrollElement = scrollElement;
        this.trackElement = trackElement;

        this.enablePositionRestrictions = options.enablePositionRestrictions === true;
        this.enableRandomPoolPositionFilters = options.enableRandomPoolPositionFilters === true;
        this.enableRandomAssignedPositionRestrictions = options.enableRandomAssignedPositionRestrictions === true;
        this.enableBraveryOption = options.enableBraveryOption === true;
        this.enablePositionMenu = this.enablePositionRestrictions || this.enableRandomAssignedPositionRestrictions || this.enableRandomPoolPositionFilters;
        this.positionMenuElement = this.enablePositionMenu ? this.createPositionMenu() : null;

        /** @type {PositionMenuTarget | null} */
        this.positionMenuTarget = null;
        /** @type {Record<string, string[]>} */
        this.positionsByChampionId = {};
        /** @type {string[]} */
        this.randomAssignedPositions = [];
        /** @type {string[]} */
        this.randomPoolPositions = [];

        this.emptyElement = this.createEmptyState(placeholderText);

        this.element.append(this.dropdownElement, this.scrollElement);
        if (this.positionMenuElement) {
            this.element.appendChild(this.positionMenuElement);
        }

        /** @type {ChampionPrioritySelectorConfig | null} */
        this.config = null;
        this.configKey = configKey;
        this.quickAction = false;

        this.loadChampions = loadChampions;
        /** @type {Champion[]} */
        this.champions = [];
        /** @type {Map<number, Champion>} */
        this.championById = new Map();
        /** @type {import("./champion-priority-options.js").ChampionPriorityOption[]} */
        this.selectedPriorityOptions = [];
        /** @type {Map<string, HTMLElement>} */
        this.optionButtons = new Map();

        /** @type {DragState | null} */
        this.dragState = null;
        this.handleWindowPointerMove = event => this.moveDrag(event);
        this.handleWindowPointerUp = event => this.finishDrag(event);
        this.handleWindowPointerCancel = event => this.cancelDrag(event);
        this.handlePositionMenuOutsidePointerDown = event => this.closePositionMenuOnOutsidePointerDown(event);
        this.handlePositionMenuKeyDown = event => this.closePositionMenuOnKeyDown(event);
        /** @type {Promise<void> | null} */
        this.setupInFlight = null;
        this.setupPending = false;
    }

    /**
     * @returns {HTMLDivElement}
     */
    createRootElement() {
        const element = document.createElement("div");
        element.classList.add("champion-priority-selector");
        return element;
    }

    /**
     * @returns {HTMLElement}
     */
    createDropdownElement() {
        const dropdownElement = document.createElement(LEAGUE_CLIENT_ELEMENTS.dropdown);
        dropdownElement.classList.add("dropdown-champions-default", "dropdown-drop-up");
        return dropdownElement;
    }

    /**
     * @returns {SelectedChampionsScrollElements}
     */
    createSelectedChampionsScroll() {
        const scrollElement = document.createElement(LEAGUE_CLIENT_ELEMENTS.scrollable);
        scrollElement.classList.add("champion-priority-selector__scroll");
        scrollElement.setAttribute("direction", "horizontal");
        scrollElement.setAttribute("overflow-masks", "disabled");
        scrollElement.setAttribute("side-scroll-wheel", "true");

        const trackElement = document.createElement("div");
        trackElement.classList.add("champion-priority-selector__track");
        scrollElement.appendChild(trackElement);

        return { scrollElement, trackElement };
    }

    /**
     * @param {string} placeholderText
     * @returns {HTMLDivElement}
     */
    createEmptyState(placeholderText) {
        const emptyElement = document.createElement("div");
        emptyElement.classList.add("champion-priority-selector__empty");

        const emptyTitle = document.createElement("span");
        emptyTitle.innerText = "No champions";

        const emptyHint = document.createElement("span");
        const optionType = placeholderText.replace(/^Add\s+/i, "").toLowerCase();
        emptyHint.innerText = `Use dropdown to add ${optionType} option`;

        emptyElement.append(emptyTitle, emptyHint);
        return emptyElement;
    }

    /**
     * @returns {HTMLDivElement}
     */
    createPositionMenu() {
        const menu = document.createElement("div");
        menu.classList.add("champion-priority-selector__position-menu");
        menu.hidden = true;

        for (const position of POSITIONS) {
            menu.appendChild(this.createPositionOption(position));
        }

        return menu;
    }

    /**
     * @param {{value: string, label: string, iconPath: string}} position
     * @returns {HTMLButtonElement}
     */
    createPositionOption(position) {
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
            this.togglePositionMenuPosition(position.value);
        });

        const image = document.createElement("img");
        image.src = position.iconPath;
        image.alt = position.label;
        image.draggable = false;

        button.appendChild(image);
        return button;
    }

    /**
     * Queues setup so overlapping refresh calls run one after another instead of racing.
     *
     * @returns {Promise<void>}
     */
    async setup() {
        this.setupPending = true;

        if (!this.setupInFlight) {
            this.setupInFlight = this.runSetupLoop();
        }

        return this.setupInFlight;
    }

    /**
     * @returns {Promise<void>}
     */
    refresh() {
        return this.setup();
    }

    /**
     * @returns {Promise<void>}
     */
    async runSetupLoop() {
        try {
            while (this.setupPending) {
                this.setupPending = false;
                await this.performSetup();
            }
        } finally {
            this.setupInFlight = null;
        }
    }

    /**
     * @returns {Promise<void>}
     */
    async performSetup() {
        this.champions = await this.loadChampions();
        this.championById = new Map(this.champions.map(champion => [champion.id, champion]));

        const allowedChampionIds = this.getAllowedChampionIds();
        this.config = ensureConfig(this.configKey, { allowedChampionIds });
        this.quickAction = this.config.quickAction === true;
        this.selectedPriorityOptions = normalizeChampionPriorityOptions(this.config.priorityOptions || this.config.champions, allowedChampionIds)
            .filter(option => this.isPriorityOptionEnabled(option));

        if (this.enablePositionRestrictions) {
            this.positionsByChampionId = normalizePositionsByChampionId(
                this.config.positionsByChampionId,
                getChampionIdsFromPriorityOptions(this.selectedPriorityOptions)
            );
        }
        if (this.enableRandomAssignedPositionRestrictions) {
            this.randomAssignedPositions = normalizePositionList(this.config.randomAssignedPositions);
        }
        if (this.enableRandomPoolPositionFilters) {
            this.randomPoolPositions = normalizePositionList(this.config.randomPoolPositions);
        }

        this.championDropdown.renderOptions(this.champions);
        this.renderSelectedPriorityOptions();

        const root = await this.championDropdown.waitForRender();
        if (!root) {
            return;
        }

        this.championDropdown.ensureSearchPlaceholder(root);
        this.championDropdown.ensureQuickActionToggle(root);
        this.championDropdown.patchDropdownShadowDom();
    }

    /**
     * @returns {Set<number>}
     */
    getAllowedChampionIds() {
        return new Set(this.championById.keys());
    }

    /**
     * @returns {boolean}
     */
    isQuickActionEnabled() {
        return this.quickAction === true;
    }

    /**
     * @param {import("./champion-priority-options.js").ChampionPriorityOption} option
     * @returns {boolean}
     */
    isPriorityOptionEnabled(option) {
        return !isBraveryChampionOption(option) || this.enableBraveryOption;
    }

    /**
     * @returns {boolean} The quick action state after toggling.
     */
    toggleQuickAction() {
        const allowedChampionIds = this.getAllowedChampionIds();

        this.config = patchConfig(this.configKey, config => {
            config.quickAction = config.quickAction !== true;
            return config;
        }, {
            allowedChampionIds,
            selectedChampionIds: getChampionIdsFromPriorityOptions(this.selectedPriorityOptions)
        });

        this.quickAction = this.config.quickAction === true;
        this.championDropdown.syncQuickActionToggle();
        return this.quickAction;
    }

    /**
     * @param {unknown} option
     * @returns {void}
     */
    addPriorityOption(option) {
        const normalizedOption = toChampionPriorityOption(option);
        if (
            normalizedOption === null ||
            this.selectedPriorityOptions.includes(normalizedOption) ||
            !this.isPriorityOptionEnabled(normalizedOption) ||
            (
                !isRandomChampionOption(normalizedOption) &&
                !isBraveryChampionOption(normalizedOption) &&
                !this.championById.has(normalizedOption)
            )
        ) {
            return;
        }

        this.selectedPriorityOptions.push(normalizedOption);
        this.renderSelectedPriorityOptions();
        this.saveConfig();
    }

    /**
     * @param {unknown} option
     * @returns {void}
     */
    removePriorityOption(option) {
        const normalizedOption = toChampionPriorityOption(option);
        const optionIndex = this.selectedPriorityOptions.indexOf(normalizedOption);
        if (normalizedOption === null || optionIndex === -1) {
            return;
        }
        this.selectedPriorityOptions.splice(optionIndex, 1);

        const removedChampionId = typeof normalizedOption === "number" ? normalizedOption : null;
        if (this.positionMenuTarget?.option === normalizedOption) {
            this.closePositionMenu();
        }

        if (this.enablePositionRestrictions && removedChampionId !== null) {
            delete this.positionsByChampionId[String(removedChampionId)];
        }
        if (this.enableRandomAssignedPositionRestrictions && isRandomChampionOption(normalizedOption)) {
            this.randomAssignedPositions = [];
        }
        if (this.enableRandomPoolPositionFilters && isRandomChampionOption(normalizedOption)) {
            this.randomPoolPositions = [];
        }

        this.renderSelectedPriorityOptions();
        this.saveConfig();
    }

    /**
     * @param {unknown} option
     * @param {number} dropIndex
     * @returns {boolean} True when the selected order actually changed.
     */
    movePriorityOptionToIndex(option, dropIndex) {
        const normalizedOption = toChampionPriorityOption(option);
        const currentIndex = this.selectedPriorityOptions.indexOf(normalizedOption);
        if (normalizedOption === null || currentIndex === -1) {
            return false;
        }

        const [movedOption] = this.selectedPriorityOptions.splice(currentIndex, 1);
        const boundedDropIndex = Math.max(0, Math.min(dropIndex, this.selectedPriorityOptions.length));
        this.selectedPriorityOptions.splice(boundedDropIndex, 0, movedOption);
        return currentIndex !== boundedDropIndex;
    }

    /**
     * @returns {void}
     */
    syncPositionsByChampionId() {
        if (!this.enablePositionRestrictions) {
            return;
        }

        this.positionsByChampionId = normalizePositionsByChampionId(
            this.positionsByChampionId,
            getChampionIdsFromPriorityOptions(this.selectedPriorityOptions)
        );
    }

    /**
     * @returns {void}
     */
    syncRandomPoolPositions() {
        if (!this.enableRandomPoolPositionFilters) {
            return;
        }

        this.randomPoolPositions = normalizePositionList(this.randomPoolPositions);
    }

    /**
     * @returns {void}
     */
    syncRandomAssignedPositions() {
        if (!this.enableRandomAssignedPositionRestrictions) {
            return;
        }

        this.randomAssignedPositions = normalizePositionList(this.randomAssignedPositions);
    }

    /**
     * @returns {void}
     */
    saveConfig() {
        this.syncPositionsByChampionId();
        this.syncRandomAssignedPositions();
        this.syncRandomPoolPositions();

        const allowedChampionIds = this.getAllowedChampionIds();
        this.config = patchConfig(this.configKey, config => {
            config.priorityOptions = [...this.selectedPriorityOptions];
            config.champions = getChampionIdsFromPriorityOptions(this.selectedPriorityOptions);
            if (this.enableRandomAssignedPositionRestrictions) {
                config.randomAssignedPositions = [...this.randomAssignedPositions];
            }
            if (this.enableRandomPoolPositionFilters) {
                config.randomPoolPositions = [...this.randomPoolPositions];
            }
            if (this.enablePositionRestrictions) {
                config.positionsByChampionId = { ...this.positionsByChampionId };
            }
            return config;
        }, {
            allowedChampionIds,
            selectedChampionIds: getChampionIdsFromPriorityOptions(this.selectedPriorityOptions)
        });

        if (this.enablePositionRestrictions) {
            this.positionsByChampionId = this.config.positionsByChampionId || {};
        }
        if (this.enableRandomAssignedPositionRestrictions) {
            this.randomAssignedPositions = this.config.randomAssignedPositions || [];
        }
        if (this.enableRandomPoolPositionFilters) {
            this.randomPoolPositions = this.config.randomPoolPositions || [];
        }

        console.debug(this.configKey, this.config);
    }

    /**
     * @param {Map<string, DOMRect> | null} [previousPositions]
     * @param {import("./champion-priority-options.js").ChampionPriorityOption | null} [draggedOption]
     * @returns {void}
     */
    renderSelectedPriorityOptions(previousPositions = null, draggedOption = null) {
        if (this.positionMenuTarget !== null) {
            this.closePositionMenu();
        }

        const activeOptionKeys = new Set(
            this.selectedPriorityOptions.map(option => toChampionPriorityOptionKey(option))
        );

        for (const [optionKey, button] of this.optionButtons) {
            if (!activeOptionKeys.has(optionKey)) {
                button.remove();
                this.optionButtons.delete(optionKey);
            }
        }

        if (this.selectedPriorityOptions.length === 0) {
            this.trackElement.replaceChildren(this.emptyElement);
            return;
        }

        this.emptyElement.remove();

        const orderedButtons = this.selectedPriorityOptions
            .map((option, index) => this.getPriorityOptionButton(option, index))
            .filter(Boolean);

        this.trackElement.append(...orderedButtons);

        if (previousPositions) {
            this.animateReorder(previousPositions, draggedOption);
        }
    }

    /**
     * @param {import("./champion-priority-options.js").ChampionPriorityOption} option
     * @param {number} index
     * @returns {HTMLElement | null}
     */
    getPriorityOptionButton(option, index) {
        if (isRandomChampionOption(option)) {
            return this.getRandomOptionButton(index);
        }

        if (isBraveryChampionOption(option)) {
            return this.enableBraveryOption ? this.getBraveryOptionButton(index) : null;
        }

        return this.getChampionOptionButton(option, index);
    }

    /**
     * @param {number} championId
     * @param {number} index
     * @returns {HTMLElement | null}
     */
    getChampionOptionButton(championId, index) {
        const champion = this.championById.get(championId);
        if (!champion) {
            return null;
        }

        const optionKey = String(championId);
        let button = this.optionButtons.get(optionKey);
        if (!button) {
            button = this.createIconButton(champion);
            this.optionButtons.set(optionKey, button);
        }

        button.dataset.rank = String(index + 1);
        button.classList.toggle("champion-priority-selector__icon--random", false);
        const positionText = this.getChampionPositionTitleSuffix(championId);
        button.title = `${index + 1}. ${champion.name}${positionText}`;
        button.setAttribute("aria-label", `${index + 1}. ${champion.name}${positionText}`);

        const image = button.querySelector("img");
        image.src = champion.squarePortraitPath;
        image.alt = champion.name;

        const removeButton = button.querySelector(REMOVE_BUTTON_SELECTOR);
        removeButton.setAttribute("aria-label", `Remove ${champion.name}`);
        removeButton.title = `Remove ${champion.name}`;

        this.renderPositionBadge(button, championId);

        return button;
    }

    /**
     * @param {number} index
     * @returns {HTMLElement}
     */
    getRandomOptionButton(index) {
        let button = this.optionButtons.get(RANDOM_CHAMPION_OPTION);
        if (!button) {
            button = this.createRandomOptionButton();
            this.optionButtons.set(RANDOM_CHAMPION_OPTION, button);
        }

        button.dataset.rank = String(index + 1);
        const positionText = this.getRandomPositionTitleSuffix();
        button.title = `${index + 1}. ${RANDOM_OPTION_LABEL}${positionText}`;
        button.setAttribute("aria-label", `${index + 1}. ${RANDOM_OPTION_LABEL}${positionText}`);

        const removeButton = button.querySelector(REMOVE_BUTTON_SELECTOR);
        removeButton.setAttribute("aria-label", `Remove ${RANDOM_OPTION_LABEL}`);
        removeButton.title = `Remove ${RANDOM_OPTION_LABEL}`;

        this.renderPositionBadge(button, RANDOM_CHAMPION_OPTION);

        return button;
    }

    /**
     * @param {number} index
     * @returns {HTMLElement}
     */
    getBraveryOptionButton(index) {
        let button = this.optionButtons.get(BRAVERY_CHAMPION_OPTION);
        if (!button) {
            button = this.createBraveryOptionButton();
            this.optionButtons.set(BRAVERY_CHAMPION_OPTION, button);
        }

        button.dataset.rank = String(index + 1);
        button.title = `${index + 1}. ${BRAVERY_OPTION_LABEL}`;
        button.setAttribute("aria-label", `${index + 1}. ${BRAVERY_OPTION_LABEL}`);

        const image = button.querySelector("img");
        image.src = BRAVERY_OPTION_ICON_PATH;
        image.alt = BRAVERY_OPTION_LABEL;

        const removeButton = button.querySelector(REMOVE_BUTTON_SELECTOR);
        removeButton.setAttribute("aria-label", `Remove ${BRAVERY_OPTION_LABEL}`);
        removeButton.title = `Remove ${BRAVERY_OPTION_LABEL}`;

        return button;
    }

    /**
     * @param {Champion} champion
     * @returns {HTMLElement}
     */
    createIconButton(champion) {
        const button = document.createElement("div");
        button.classList.add("champion-priority-selector__icon");
        button.setAttribute("role", "button");
        button.tabIndex = 0;

        const image = document.createElement("img");
        image.draggable = false;

        const removeButton = document.createElement("button");
        removeButton.classList.add("champion-priority-selector__remove");
        removeButton.type = "button";
        removeButton.dataset.icon = REMOVE_ICON_TEXT;
        removeButton.addEventListener("pointerdown", event => event.stopPropagation());
        removeButton.addEventListener("click", event => {
            event.stopPropagation();
            this.removePriorityOption(champion.id);
        });

        button.addEventListener("pointerdown", event => this.startDrag(event, champion.id));
        button.addEventListener("auxclick", event => this.removePriorityOptionOnMiddleClick(event, champion.id));
        if (this.enablePositionRestrictions) {
            const championAssignedTarget = { option: champion.id, kind: POSITION_MENU_TARGET_KIND.CHAMPION_ASSIGNED };
            button.addEventListener("contextmenu", event => this.openPositionMenu(event, championAssignedTarget));
        }

        button.append(image, removeButton);
        return button;
    }

    /**
     * @returns {HTMLElement}
     */
    createRandomOptionButton() {
        const button = document.createElement("div");
        button.classList.add("champion-priority-selector__icon", "champion-priority-selector__icon--random");
        button.setAttribute("role", "button");
        button.tabIndex = 0;

        const icon = document.createElement("span");
        icon.classList.add("champion-priority-selector__random-icon");
        icon.innerText = RANDOM_ICON_TEXT;

        const removeButton = document.createElement("button");
        removeButton.classList.add("champion-priority-selector__remove");
        removeButton.type = "button";
        removeButton.dataset.icon = REMOVE_ICON_TEXT;
        removeButton.addEventListener("pointerdown", event => event.stopPropagation());
        removeButton.addEventListener("click", event => {
            event.stopPropagation();
            this.removePriorityOption(RANDOM_CHAMPION_OPTION);
        });

        button.addEventListener("pointerdown", event => this.startDrag(event, RANDOM_CHAMPION_OPTION));
        button.addEventListener("auxclick", event => this.removePriorityOptionOnMiddleClick(event, RANDOM_CHAMPION_OPTION));
        if (this.enableRandomPoolPositionFilters) {
            const randomPoolTarget = { option: RANDOM_CHAMPION_OPTION, kind: POSITION_MENU_TARGET_KIND.RANDOM_POOL };
            button.addEventListener("contextmenu", event => this.openPositionMenu(event, randomPoolTarget));
        }
        button.append(icon, removeButton);
        return button;
    }

    /**
     * @returns {HTMLElement}
     */
    createBraveryOptionButton() {
        const button = document.createElement("div");
        button.classList.add("champion-priority-selector__icon", BRAVERY_SELECTED_ICON_CLASS);
        button.setAttribute("role", "button");
        button.tabIndex = 0;

        const image = document.createElement("img");
        image.draggable = false;

        const removeButton = document.createElement("button");
        removeButton.classList.add("champion-priority-selector__remove");
        removeButton.type = "button";
        removeButton.dataset.icon = REMOVE_ICON_TEXT;
        removeButton.addEventListener("pointerdown", event => event.stopPropagation());
        removeButton.addEventListener("click", event => {
            event.stopPropagation();
            this.removePriorityOption(BRAVERY_CHAMPION_OPTION);
        });

        button.addEventListener("pointerdown", event => this.startDrag(event, BRAVERY_CHAMPION_OPTION));
        button.addEventListener("auxclick", event => this.removePriorityOptionOnMiddleClick(event, BRAVERY_CHAMPION_OPTION));
        button.append(image, removeButton);
        return button;
    }

    /**
     * @param {unknown} championId
     * @returns {string[]}
     */
    getChampionAllowedPositions(championId) {
        const normalizedChampionId = toChampionId(championId);
        return normalizedChampionId === null ? [] : this.positionsByChampionId[String(normalizedChampionId)] || [];
    }

    /**
     * @returns {string[]}
     */
    getRandomPoolPositions() {
        return this.randomPoolPositions;
    }

    /**
     * @returns {string[]}
     */
    getRandomAssignedPositions() {
        return this.randomAssignedPositions;
    }

    /**
     * @param {string[]} positions
     * @returns {string[]}
     */
    getPositionLabels(positions) {
        return positions
            .map(position => getPositionMetadata(position)?.label)
            .filter(Boolean);
    }

    /**
     * @param {unknown} championId
     * @returns {string[]}
     */
    getChampionAllowedPositionLabels(championId) {
        return this.getPositionLabels(this.getChampionAllowedPositions(championId));
    }

    /**
     * @returns {string[]}
     */
    getRandomPoolPositionLabels() {
        return this.getPositionLabels(this.getRandomPoolPositions());
    }

    /**
     * @returns {string[]}
     */
    getRandomAssignedPositionLabels() {
        return this.getPositionLabels(this.getRandomAssignedPositions());
    }

    /**
     * @param {unknown} championId
     * @returns {string}
     */
    getChampionPositionTitleSuffix(championId) {
        const allowedPositionLabels = this.getChampionAllowedPositionLabels(championId);
        return allowedPositionLabels.length > 0 ? ` (${allowedPositionLabels.join(", ")})` : "";
    }

    /**
     * @returns {string}
     */
    getRandomPositionTitleSuffix() {
        const parts = [];
        const assignedPositionLabels = this.getRandomAssignedPositionLabels();
        const randomPositionLabels = this.getRandomPoolPositionLabels();

        if (assignedPositionLabels.length > 0) {
            parts.push(`runs only when assigned lane matches ${this.formatPositionLabelsForSentence(assignedPositionLabels)}`);
        }

        if (randomPositionLabels.length > 0) {
            parts.push(`filters random pool to ${this.formatPositionLabelsForSentence(randomPositionLabels)}`);
        }

        return parts.length > 0 ? ` (${parts.join("; ")})` : "";
    }

    /**
     * @param {string[]} positionLabels
     * @returns {string}
     */
    formatPositionLabelsForSentence(positionLabels) {
        if (positionLabels.length <= 1) {
            return positionLabels[0] || "";
        }

        if (positionLabels.length === 2) {
            return `${positionLabels[0]} or ${positionLabels[1]}`;
        }

        return `${positionLabels.slice(0, -1).join(", ")}, or ${positionLabels[positionLabels.length - 1]}`;
    }

    /**
     * @param {HTMLElement} button
     * @param {import("./champion-priority-options.js").ChampionPriorityOption} option
     * @returns {void}
     */
    renderPositionBadge(button, option) {
        button.querySelectorAll(POSITION_BADGE_SELECTOR).forEach(badge => badge.remove());
        const normalizedOption = toChampionPriorityOption(option);
        if (normalizedOption === null) {
            return;
        }

        for (const target of this.getPositionBadgeTargetsForOption(normalizedOption)) {
            const badge = this.createPositionBadge(target);
            if (badge) {
                button.appendChild(badge);
            }
        }
    }

    /**
     * @param {import("./champion-priority-options.js").ChampionPriorityOption} option
     * @returns {PositionMenuTarget[]}
     */
    getPositionBadgeTargetsForOption(option) {
        if (!this.selectedPriorityOptions.includes(option)) {
            return [];
        }

        if (isRandomChampionOption(option)) {
            return [
                { option, kind: POSITION_MENU_TARGET_KIND.RANDOM_ASSIGNED },
                { option, kind: POSITION_MENU_TARGET_KIND.RANDOM_POOL }
            ].filter(target => this.canOpenPositionMenuForTarget(target));
        }

        if (isBraveryChampionOption(option)) {
            return [];
        }

        return [{ option, kind: POSITION_MENU_TARGET_KIND.CHAMPION_ASSIGNED }]
            .filter(target => this.canOpenPositionMenuForTarget(target));
    }

    /**
     * @param {PositionMenuTarget} target
     * @returns {HTMLButtonElement | null}
     */
    createPositionBadge(target) {
        const allowedPositions = this.getAllowedPositionsForPositionMenuTarget(target);
        const allowedPositionLabels = this.getAllowedPositionLabelsForPositionMenuTarget(target);
        const isRandomPoolTarget = target.kind === POSITION_MENU_TARGET_KIND.RANDOM_POOL;

        const badge = document.createElement("button");
        badge.classList.add("champion-priority-selector__position-badge");
        badge.classList.toggle("champion-priority-selector__position-badge--random", isRandomPoolTarget);
        badge.type = "button";
        badge.dataset.positionTarget = target.kind;
        badge.title = this.getPositionBadgeTitle(allowedPositionLabels, target);
        badge.setAttribute("aria-label", badge.title);
        badge.addEventListener("pointerdown", event => event.stopPropagation());
        badge.addEventListener("click", event => this.openPositionMenu(event, target, badge));

        if (isRandomPoolTarget) {
            if (allowedPositions.length > 0) {
                badge.classList.add("champion-priority-selector__position-badge--active");
                badge.dataset.count = String(allowedPositions.length);
            } else {
                badge.classList.add("champion-priority-selector__position-badge--empty");
            }

            return badge;
        }

        if (allowedPositions.length === 0) {
            badge.classList.add("champion-priority-selector__position-badge--empty");
            badge.innerText = "+";
            return badge;
        }

        const firstPosition = getPositionMetadata(allowedPositions[0]);
        if (!firstPosition) {
            return null;
        }

        if (allowedPositions.length > 1) {
            badge.dataset.count = String(allowedPositions.length);
        }

        const image = document.createElement("img");
        image.src = firstPosition.iconPath;
        image.alt = firstPosition.label;
        image.draggable = false;

        badge.appendChild(image);
        return badge;
    }

    /**
     * @param {string[]} allowedPositionLabels
     * @param {PositionMenuTarget} target
     * @returns {string}
     */
    getPositionBadgeTitle(allowedPositionLabels, target) {
        if (target.kind === POSITION_MENU_TARGET_KIND.RANDOM_ASSIGNED) {
            if (allowedPositionLabels.length === 0) {
                return "The plugin can use Random in any lane. Click to run it only in selected draft lanes.";
            }

            return `The plugin will use Random only when your assigned lane matches ${this.formatPositionLabelsForSentence(allowedPositionLabels)}. Draft modes only. Click to edit.`;
        }

        if (target.kind === POSITION_MENU_TARGET_KIND.RANDOM_POOL) {
            if (allowedPositionLabels.length === 0) {
                return "The plugin can choose any available champion at random. Click to filter the pool first.";
            }

            return `The plugin filters Random to champions for ${this.formatPositionLabelsForSentence(allowedPositionLabels)}, then picks one. Click to edit.`;
        }

        if (allowedPositionLabels.length > 0) {
            return `The plugin will pick this champion only when your assigned lane matches ${this.formatPositionLabelsForSentence(allowedPositionLabels)}. Draft modes only. Click to edit.`;
        }

        return "The plugin can pick this champion in any lane. Click to limit it to selected draft lanes.";
    }

    /**
     * @param {PositionMenuTarget} target
     * @returns {boolean}
     */
    canOpenPositionMenuForTarget(target) {
        if (!this.selectedPriorityOptions.includes(target.option)) {
            return false;
        }

        switch (target.kind) {
            case POSITION_MENU_TARGET_KIND.CHAMPION_ASSIGNED:
                return typeof target.option === "number" && this.enablePositionRestrictions;
            case POSITION_MENU_TARGET_KIND.RANDOM_ASSIGNED:
                return isRandomChampionOption(target.option) && this.enableRandomAssignedPositionRestrictions;
            case POSITION_MENU_TARGET_KIND.RANDOM_POOL:
                return isRandomChampionOption(target.option) && this.enableRandomPoolPositionFilters;
            default:
                return false;
        }
    }

    /**
     * @param {PositionMenuTarget} target
     * @returns {PositionMenuTarget | null}
     */
    normalizePositionMenuTarget(target) {
        if (!target || typeof target !== "object" || Array.isArray(target) || !("option" in target) || !("kind" in target)) {
            return null;
        }

        const normalizedOption = toChampionPriorityOption(target.option);
        const normalizedTarget = normalizedOption === null
            ? null
            : {
                option: normalizedOption,
                kind: String(target.kind)
            };

        return normalizedTarget && this.canOpenPositionMenuForTarget(normalizedTarget) ? normalizedTarget : null;
    }

    /**
     * @param {PositionMenuTarget} target
     * @returns {string[]}
     */
    getAllowedPositionsForPositionMenuTarget(target) {
        switch (target.kind) {
            case POSITION_MENU_TARGET_KIND.CHAMPION_ASSIGNED:
                return this.getChampionAllowedPositions(target.option);
            case POSITION_MENU_TARGET_KIND.RANDOM_ASSIGNED:
                return this.getRandomAssignedPositions();
            case POSITION_MENU_TARGET_KIND.RANDOM_POOL:
                return this.getRandomPoolPositions();
            default:
                return [];
        }
    }

    /**
     * @param {PositionMenuTarget} target
     * @returns {string[]}
     */
    getAllowedPositionLabelsForPositionMenuTarget(target) {
        return this.getPositionLabels(this.getAllowedPositionsForPositionMenuTarget(target));
    }

    /**
     * @param {PositionMenuTarget} target
     * @param {string[]} positions
     * @returns {void}
     */
    setAllowedPositionsForPositionMenuTarget(target, positions) {
        switch (target.kind) {
            case POSITION_MENU_TARGET_KIND.CHAMPION_ASSIGNED: {
                const championIdKey = String(target.option);
                if (positions.length > 0) {
                    this.positionsByChampionId[championIdKey] = positions;
                } else {
                    delete this.positionsByChampionId[championIdKey];
                }
                break;
            }
            case POSITION_MENU_TARGET_KIND.RANDOM_ASSIGNED:
                this.randomAssignedPositions = positions;
                break;
            case POSITION_MENU_TARGET_KIND.RANDOM_POOL:
                this.randomPoolPositions = positions;
                break;
        }
    }

    /**
     * @param {MouseEvent} event
     * @param {PositionMenuTarget} target
     * @param {HTMLElement | null} [anchorElement]
     * @returns {void}
     */
    openPositionMenu(event, target, anchorElement = null) {
        if (!this.positionMenuElement) {
            return;
        }

        const normalizedTarget = this.normalizePositionMenuTarget(target);
        if (normalizedTarget === null) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        this.positionMenuTarget = normalizedTarget;
        this.renderPositionMenu();
        this.positionMenuElement.hidden = false;
        this.positionMenuElement.style.left = "0px";
        this.positionMenuElement.style.top = "0px";

        const { left, top } = this.getPositionMenuCoordinates(event, anchorElement);
        this.positionMenuElement.style.left = `${left}px`;
        this.positionMenuElement.style.top = `${top}px`;
        document.addEventListener("pointerdown", this.handlePositionMenuOutsidePointerDown, true);
        document.addEventListener("keydown", this.handlePositionMenuKeyDown, true);
    }

    /**
     * @param {MouseEvent} event
     * @param {HTMLElement | null} [anchorElement]
     * @returns {{left: number, top: number}}
     */
    getPositionMenuCoordinates(event, anchorElement = null) {
        const menuRect = this.positionMenuElement.getBoundingClientRect();
        let clientX = event.clientX;
        let clientY = event.clientY;

        if (anchorElement && event.type === "click" && event.detail === 0) {
            const anchorRect = anchorElement.getBoundingClientRect();
            clientX = anchorRect.left + anchorRect.width / 2;
            clientY = anchorRect.bottom;
        }

        const left = Math.min(
            Math.max(clientX, POSITION_MENU_VIEWPORT_MARGIN_PX),
            window.innerWidth - menuRect.width - POSITION_MENU_VIEWPORT_MARGIN_PX
        );
        const top = Math.min(
            Math.max(clientY, POSITION_MENU_VIEWPORT_MARGIN_PX),
            window.innerHeight - menuRect.height - POSITION_MENU_VIEWPORT_MARGIN_PX
        );

        return { left, top };
    }

    renderPositionMenu() {
        if (!this.positionMenuElement || this.positionMenuTarget === null) {
            return;
        }

        const allowedPositions = new Set(this.getAllowedPositionsForPositionMenuTarget(this.positionMenuTarget));
        this.positionMenuElement.querySelectorAll(POSITION_OPTION_SELECTOR).forEach(button => {
            const selected = allowedPositions.has(button.dataset.position);
            button.classList.toggle("champion-priority-selector__position-option--selected", selected);
            button.setAttribute("aria-pressed", String(selected));
        });
    }

    /**
     * @param {unknown} position
     * @returns {void}
     */
    togglePositionMenuPosition(position) {
        if (!this.positionMenuElement || this.positionMenuTarget === null) {
            return;
        }

        const normalizedPosition = normalizePosition(position);
        if (!normalizedPosition) {
            return;
        }

        const target = this.positionMenuTarget;
        const targetOption = target.option;
        const allowedPositions = new Set(this.getAllowedPositionsForPositionMenuTarget(target));
        if (allowedPositions.has(normalizedPosition)) {
            allowedPositions.delete(normalizedPosition);
        } else {
            allowedPositions.add(normalizedPosition);
        }

        const orderedAllowedPositions = POSITIONS
            .map(positionMetadata => positionMetadata.value)
            .filter(positionValue => allowedPositions.has(positionValue));

        this.setAllowedPositionsForPositionMenuTarget(target, orderedAllowedPositions);

        this.renderPositionMenu();

        const optionKey = toChampionPriorityOptionKey(targetOption);
        const iconButton = optionKey ? this.optionButtons.get(optionKey) : null;
        const iconIndex = this.selectedPriorityOptions.indexOf(targetOption);
        if (iconButton && iconIndex !== -1) {
            if (isRandomChampionOption(targetOption)) {
                this.getRandomOptionButton(iconIndex);
            } else {
                this.getChampionOptionButton(targetOption, iconIndex);
            }
        }

        this.saveConfig();
    }

    /**
     * @param {PointerEvent} event
     * @returns {void}
     */
    closePositionMenuOnOutsidePointerDown(event) {
        if (this.positionMenuElement?.contains(event.target)) {
            return;
        }

        this.closePositionMenu();
    }

    /**
     * @param {KeyboardEvent} event
     * @returns {void}
     */
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
        this.positionMenuTarget = null;
        document.removeEventListener("pointerdown", this.handlePositionMenuOutsidePointerDown, true);
        document.removeEventListener("keydown", this.handlePositionMenuKeyDown, true);
    }

    /**
     * @param {PointerEvent} event
     * @param {import("./champion-priority-options.js").ChampionPriorityOption} option
     * @returns {void}
     */
    startDrag(event, option) {
        if (event.button === MIDDLE_MOUSE_BUTTON) {
            event.preventDefault();
            return;
        }

        if (event.button !== PRIMARY_MOUSE_BUTTON) {
            return;
        }

        if (this.dragState) {
            this.clearDragState();
        }

        const optionKey = toChampionPriorityOptionKey(option);
        const iconButton = optionKey ? this.optionButtons.get(optionKey) : null;
        if (!iconButton) {
            return;
        }

        this.dragState = {
            option,
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

    /**
     * @param {MouseEvent} event
     * @param {import("./champion-priority-options.js").ChampionPriorityOption} option
     * @returns {void}
     */
    removePriorityOptionOnMiddleClick(event, option) {
        if (event.button !== MIDDLE_MOUSE_BUTTON) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        this.removePriorityOption(option);
    }

    /**
     * @param {PointerEvent} event
     * @returns {void}
     */
    moveDrag(event) {
        if (!this.dragState || this.dragState.pointerId !== event.pointerId) {
            return;
        }

        const option = this.dragState.option;
        const optionKey = toChampionPriorityOptionKey(option);
        const deltaX = event.clientX - this.dragState.startX;
        const deltaY = event.clientY - this.dragState.startY;
        const movement = Math.hypot(deltaX, deltaY);

        if (!this.dragState.active) {
            if (movement < DRAG_ACTIVATION_DISTANCE_PX) {
                return;
            }

            this.dragState.active = true;
            if (optionKey) {
                this.optionButtons.get(optionKey)?.classList.add("champion-priority-selector__icon--dragging");
            }
        }

        event.preventDefault();

        const dropIndex = this.getDropIndex(event.clientX, option);
        const currentIndex = this.selectedPriorityOptions.indexOf(option);
        if (dropIndex === currentIndex || dropIndex === -1) {
            return;
        }

        const previousPositions = this.getIconPositions();
        if (this.movePriorityOptionToIndex(option, dropIndex)) {
            this.dragState.moved = true;
            this.renderSelectedPriorityOptions(previousPositions, option);
        }
    }

    /**
     * @param {PointerEvent} event
     * @returns {void}
     */
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

    /**
     * @param {PointerEvent} event
     * @returns {void}
     */
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

        const { option, pointerId } = this.dragState;
        const optionKey = toChampionPriorityOptionKey(option);
        const iconButton = optionKey ? this.optionButtons.get(optionKey) : null;
        iconButton?.classList.remove("champion-priority-selector__icon--dragging");
        try { iconButton?.releasePointerCapture?.(pointerId); } catch { }
        window.removeEventListener("pointermove", this.handleWindowPointerMove);
        window.removeEventListener("pointerup", this.handleWindowPointerUp);
        window.removeEventListener("pointercancel", this.handleWindowPointerCancel);
        this.dragState = null;
    }

    /**
     * @param {number} clientX
     * @param {import("./champion-priority-options.js").ChampionPriorityOption} draggedOption
     * @returns {number}
     */
    getDropIndex(clientX, draggedOption) {
        const optionsWithoutDragged = this.selectedPriorityOptions.filter(option => option !== draggedOption);

        for (let index = 0; index < optionsWithoutDragged.length; index++) {
            const optionKey = toChampionPriorityOptionKey(optionsWithoutDragged[index]);
            const iconButton = optionKey ? this.optionButtons.get(optionKey) : null;
            if (!iconButton) {
                continue;
            }

            const rect = iconButton.getBoundingClientRect();
            if (clientX < rect.left + rect.width / 2) {
                return index;
            }
        }

        return optionsWithoutDragged.length;
    }

    /**
     * @returns {Map<string, DOMRect>}
     */
    getIconPositions() {
        const positions = new Map();
        for (const option of this.selectedPriorityOptions) {
            const optionKey = toChampionPriorityOptionKey(option);
            const iconButton = optionKey ? this.optionButtons.get(optionKey) : null;
            if (iconButton) {
                positions.set(optionKey, iconButton.getBoundingClientRect());
            }
        }

        return positions;
    }

    /**
     * @param {Map<string, DOMRect>} previousPositions
     * @param {import("./champion-priority-options.js").ChampionPriorityOption | null} draggedOption
     * @returns {void}
     */
    animateReorder(previousPositions, draggedOption) {
        for (const option of this.selectedPriorityOptions) {
            if (option === draggedOption) {
                continue;
            }

            const optionKey = toChampionPriorityOptionKey(option);
            const iconButton = optionKey ? this.optionButtons.get(optionKey) : null;
            const previousPosition = optionKey ? previousPositions.get(optionKey) : null;
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
                    duration: REORDER_ANIMATION_DURATION_MS,
                    easing: REORDER_ANIMATION_EASING
                }
            );
        }
    }
}
