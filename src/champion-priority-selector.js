import { normalizeChampionIds, toChampionId } from "./champion-ids.js";
import { ensureConfig, patchConfig } from "./config-store.js";
import { getPositionMetadata, normalizePosition, normalizePositionsByChampionId, POSITIONS } from "./champion-positions.js";
import { ChampionDropdown } from "./champion-dropdown.js";
import { LEAGUE_CLIENT_ELEMENTS } from "./league-client-dom.js";

/**
 * @typedef {{id: number, name: string, squarePortraitPath: string}} Champion
 *
 * @typedef {Object} ChampionPrioritySelectorOptions
 * @property {boolean} [enablePositionRestrictions] Enables the right-click per-position restriction menu.
 *
 * @typedef {Object} SelectedChampionsScrollElements
 * @property {HTMLElement} scrollElement League client UI horizontal scrollable custom element.
 * @property {HTMLDivElement} trackElement Element that owns the selected champion icons.
 *
 * @typedef {Object} DragState
 * @property {number} championId
 * @property {number} pointerId
 * @property {number} startX
 * @property {number} startY
 * @property {boolean} active
 * @property {boolean} moved
 */

const POSITION_BADGE_SELECTOR = ".champion-priority-selector__position-badge";
const POSITION_OPTION_SELECTOR = ".champion-priority-selector__position-option";
const REMOVE_BUTTON_SELECTOR = ".champion-priority-selector__remove";

const REMOVE_ICON_TEXT = "\u2715";

const PRIMARY_MOUSE_BUTTON = 0;
const MIDDLE_MOUSE_BUTTON = 1;

const POSITION_MENU_VIEWPORT_MARGIN_PX = 8;

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
        this.championDropdown = new ChampionDropdown(
            this.dropdownElement,
            placeholderText,
            championId => this.addChampion(championId)
        );

        const { scrollElement, trackElement } = this.createSelectedChampionsScroll();
        this.scrollElement = scrollElement;
        this.trackElement = trackElement;

        this.enablePositionRestrictions = options.enablePositionRestrictions === true;
        this.positionMenuElement = this.enablePositionRestrictions ? this.createPositionMenu() : null;
        /** @type {number | null} */
        this.positionMenuChampionId = null;
        /** @type {Record<string, string[]>} */
        this.positionsByChampionId = {};

        this.emptyElement = this.createEmptyState(placeholderText);

        this.element.append(this.dropdownElement, this.scrollElement);
        if (this.positionMenuElement) {
            this.element.appendChild(this.positionMenuElement);
        }

        /** @type {{enabled: boolean, force?: boolean, champions?: number[], positionsByChampionId?: Record<string, string[]>} | null} */
        this.config = null;
        this.configKey = configKey;

        this.loadChampions = loadChampions;
        /** @type {Champion[]} */
        this.champions = [];
        /** @type {Map<number, Champion>} */
        this.championById = new Map();
        /** @type {number[]} */
        this.selectedChampionIds = [];
        /** @type {Map<number, HTMLElement>} */
        this.iconButtons = new Map();

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
            this.toggleChampionPosition(position.value);
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
        this.selectedChampionIds = normalizeChampionIds(this.config.champions, allowedChampionIds);

        if (this.enablePositionRestrictions) {
            this.positionsByChampionId = normalizePositionsByChampionId(
                this.config.positionsByChampionId,
                this.selectedChampionIds
            );
        }

        this.championDropdown.renderOptions(this.champions);
        this.renderSelectedChampions();

        const root = await this.championDropdown.waitForRender();
        if (!root) {
            return;
        }

        this.championDropdown.ensureSearchPlaceholder(root);
        this.championDropdown.patchDropdownShadowDom();
    }

    /**
     * @returns {Set<number>}
     */
    getAllowedChampionIds() {
        return new Set(this.championById.keys());
    }

    /**
     * @param {unknown} championId
     * @returns {void}
     */
    addChampion(championId) {
        const normalizedChampionId = toChampionId(championId);
        if (normalizedChampionId === null || !this.championById.has(normalizedChampionId) || this.selectedChampionIds.includes(normalizedChampionId)) {
            return;
        }

        this.selectedChampionIds.push(normalizedChampionId);
        this.renderSelectedChampions();
        this.saveConfig();
    }

    /**
     * @param {unknown} championId
     * @returns {void}
     */
    removeChampion(championId) {
        const normalizedChampionId = toChampionId(championId);
        const championIndex = this.selectedChampionIds.indexOf(normalizedChampionId);
        if (normalizedChampionId === null || championIndex === -1) {
            return;
        }

        this.selectedChampionIds.splice(championIndex, 1);
        if (this.positionMenuChampionId === normalizedChampionId) {
            this.closePositionMenu();
        }

        if (this.enablePositionRestrictions) {
            delete this.positionsByChampionId[String(normalizedChampionId)];
        }

        this.renderSelectedChampions();
        this.saveConfig();
    }

    /**
     * @param {unknown} championId
     * @param {number} dropIndex
     * @returns {boolean} True when the selected order actually changed.
     */
    moveChampionToIndex(championId, dropIndex) {
        const normalizedChampionId = toChampionId(championId);
        const currentIndex = this.selectedChampionIds.indexOf(normalizedChampionId);
        if (normalizedChampionId === null || currentIndex === -1) {
            return false;
        }

        const [movedChampionId] = this.selectedChampionIds.splice(currentIndex, 1);
        const boundedDropIndex = Math.max(0, Math.min(dropIndex, this.selectedChampionIds.length));
        this.selectedChampionIds.splice(boundedDropIndex, 0, movedChampionId);
        return currentIndex !== boundedDropIndex;
    }

    /**
     * @returns {void}
     */
    syncPositionsByChampionId() {
        if (!this.enablePositionRestrictions) {
            return;
        }

        this.positionsByChampionId = normalizePositionsByChampionId(this.positionsByChampionId, this.selectedChampionIds);
    }

    /**
     * @returns {void}
     */
    saveConfig() {
        this.syncPositionsByChampionId();

        const allowedChampionIds = this.getAllowedChampionIds();
        this.config = patchConfig(this.configKey, config => {
            config.champions = [...this.selectedChampionIds];
            if (this.enablePositionRestrictions) {
                config.positionsByChampionId = { ...this.positionsByChampionId };
            }
            return config;
        }, {
            allowedChampionIds,
            selectedChampionIds: this.selectedChampionIds
        });

        if (this.enablePositionRestrictions) {
            this.positionsByChampionId = this.config.positionsByChampionId || {};
        }

        console.debug(this.configKey, this.config);
    }

    /**
     * @param {Map<number, DOMRect> | null} [previousPositions]
     * @param {number | null} [draggedChampionId]
     * @returns {void}
     */
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

    /**
     * @param {number} championId
     * @param {number} index
     * @returns {HTMLElement | null}
     */
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
            this.removeChampion(champion.id);
        });

        button.addEventListener("pointerdown", event => this.startDrag(event, champion.id));
        button.addEventListener("auxclick", event => this.removeChampionOnMiddleClick(event, champion.id));
        if (this.enablePositionRestrictions) {
            button.addEventListener("contextmenu", event => this.openPositionMenu(event, champion.id));
        }

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
     * @param {unknown} championId
     * @returns {string[]}
     */
    getChampionAllowedPositionLabels(championId) {
        return this.getChampionAllowedPositions(championId)
            .map(position => getPositionMetadata(position)?.label)
            .filter(Boolean);
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
     * @param {HTMLElement} button
     * @param {number} championId
     * @returns {void}
     */
    renderPositionBadge(button, championId) {
        button.querySelector(POSITION_BADGE_SELECTOR)?.remove();
        if (!this.enablePositionRestrictions) {
            return;
        }

        const badge = this.createPositionBadge(championId);
        if (badge) {
            button.appendChild(badge);
        }
    }

    /**
     * @param {number} championId
     * @returns {HTMLButtonElement | null}
     */
    createPositionBadge(championId) {
        const allowedPositions = this.getChampionAllowedPositions(championId);
        const allowedPositionLabels = this.getChampionAllowedPositionLabels(championId);

        const badge = document.createElement("button");
        badge.classList.add("champion-priority-selector__position-badge");
        badge.type = "button";
        badge.title = allowedPositionLabels.length > 0
            ? `${allowedPositionLabels.join(", ")}. Click to edit positions.`
            : "Any position. Click to restrict positions.";
        badge.setAttribute("aria-label", badge.title);
        badge.addEventListener("pointerdown", event => event.stopPropagation());
        badge.addEventListener("click", event => this.openPositionMenu(event, championId, badge));

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
     * @param {MouseEvent} event
     * @param {unknown} championId
     * @param {HTMLElement | null} [anchorElement]
     * @returns {void}
     */
    openPositionMenu(event, championId, anchorElement = null) {
        if (!this.enablePositionRestrictions || !this.positionMenuElement) {
            return;
        }

        const normalizedChampionId = toChampionId(championId);
        if (normalizedChampionId === null || !this.selectedChampionIds.includes(normalizedChampionId)) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        this.positionMenuChampionId = normalizedChampionId;
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
        if (!this.positionMenuElement || this.positionMenuChampionId === null) {
            return;
        }

        const allowedPositions = new Set(this.getChampionAllowedPositions(this.positionMenuChampionId));
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
    toggleChampionPosition(position) {
        if (!this.enablePositionRestrictions || this.positionMenuChampionId === null) {
            return;
        }

        const normalizedPosition = normalizePosition(position);
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

        const orderedAllowedPositions = POSITIONS
            .map(positionMetadata => positionMetadata.value)
            .filter(positionValue => allowedPositions.has(positionValue));

        if (orderedAllowedPositions.length > 0) {
            this.positionsByChampionId[championIdKey] = orderedAllowedPositions;
        } else {
            delete this.positionsByChampionId[championIdKey];
        }

        this.renderPositionMenu();

        const iconButton = this.iconButtons.get(this.positionMenuChampionId);
        const iconIndex = this.selectedChampionIds.indexOf(this.positionMenuChampionId);
        if (iconButton && iconIndex !== -1) {
            this.getIconButton(this.positionMenuChampionId, iconIndex);
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
        this.positionMenuChampionId = null;
        document.removeEventListener("pointerdown", this.handlePositionMenuOutsidePointerDown, true);
        document.removeEventListener("keydown", this.handlePositionMenuKeyDown, true);
    }

    /**
     * @param {PointerEvent} event
     * @param {number} championId
     * @returns {void}
     */
    startDrag(event, championId) {
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

    /**
     * @param {MouseEvent} event
     * @param {number} championId
     * @returns {void}
     */
    removeChampionOnMiddleClick(event, championId) {
        if (event.button !== MIDDLE_MOUSE_BUTTON) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        this.removeChampion(championId);
    }

    /**
     * @param {PointerEvent} event
     * @returns {void}
     */
    moveDrag(event) {
        if (!this.dragState || this.dragState.pointerId !== event.pointerId) {
            return;
        }

        const championId = this.dragState.championId;
        const deltaX = event.clientX - this.dragState.startX;
        const deltaY = event.clientY - this.dragState.startY;
        const movement = Math.hypot(deltaX, deltaY);

        if (!this.dragState.active) {
            if (movement < DRAG_ACTIVATION_DISTANCE_PX) {
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

        const { championId, pointerId } = this.dragState;
        const iconButton = this.iconButtons.get(championId);
        iconButton?.classList.remove("champion-priority-selector__icon--dragging");
        try { iconButton?.releasePointerCapture?.(pointerId); } catch { }
        window.removeEventListener("pointermove", this.handleWindowPointerMove);
        window.removeEventListener("pointerup", this.handleWindowPointerUp);
        window.removeEventListener("pointercancel", this.handleWindowPointerCancel);
        this.dragState = null;
    }

    /**
     * @param {number} clientX
     * @param {number} draggedChampionId
     * @returns {number}
     */
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

    /**
     * @returns {Map<number, DOMRect>}
     */
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

    /**
     * @param {Map<number, DOMRect>} previousPositions
     * @param {number | null} draggedChampionId
     * @returns {void}
     */
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
                    duration: REORDER_ANIMATION_DURATION_MS,
                    easing: REORDER_ANIMATION_EASING
                }
            );
        }
    }
}
