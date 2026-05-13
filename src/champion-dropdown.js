import { sleep } from "https://cdn.jsdelivr.net/npm/balaclava-utils@latest";
import { LEAGUE_CLIENT_ELEMENTS, LEAGUE_CLIENT_SELECTORS } from "./league-client-dom.js";
import { normalizePosition, POSITIONS } from "./champion-positions.js";

/**
 * @typedef {import("./champion-positions.js").PositionValue} PositionValue
 *
 * @typedef {{id: number, name: string, squarePortraitPath: string, recommendedPositions?: PositionValue[]}} Champion
 * @callback ChampionSelectedCallback
 * @param {number} championId
 * @returns {void}
 *
 * @typedef {Object} ChampionDropdownOptions
 * @property {string} [searchPlaceholderText]
 * @property {string} [quickActionLabel]
 * @property {() => boolean} [isQuickActionEnabled]
 * @property {() => boolean} [onQuickActionToggle]
 */

const DROPDOWN_RENDER_ATTEMPTS = 50;
const DROPDOWN_RENDER_RETRY_DELAY_MS = 100;
const DROPDOWN_OPTIONS_HEIGHT_PX = 210;

const POSITION_FILTER_HEIGHT_PX = 40;
const POSITION_FILTER_CLASS = "controlado-position-filter";
const POSITION_FILTER_VISIBLE_CLASS = "controlado-position-filter-visible";
const POSITION_FILTER_BADGE_CLASS = "controlado-position-filter__badge";
const POSITION_FILTER_BADGE_ACTIVE_CLASS = "controlado-position-filter__badge--active";

const SEARCH_PLACEHOLDER_ID = "controlado-placeholder";
const SEARCH_INPUT_ID = "controlado-search";
const SEARCH_INPUT_CLASS = "controlado-filter-input";
const SEARCH_TAG_CLASS = "controlado-tag--search";

const QUICK_ACTION_TOGGLE_ID = "controlado-quick-action";
const QUICK_ACTION_TOGGLE_CLASS = "controlado-quick-action-toggle";
const QUICK_ACTION_TOGGLE_ACTIVE_CLASS = "controlado-quick-action-toggle--active";
const QUICK_ACTION_ICON_MASK = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='black' d='M13.1 2 4 13.2h6.7L9.9 22 20 9.8h-6.9L13.1 2z'/%3E%3C/svg%3E\")";

const TAG_CLASS = "controlado-tag";

const FILTER_ICON_CLASS = "controlado-filter-icon";
const FILTER_ICON_TRASH_CLASS = "controlado-filter-icon--trash";

const CHAMPION_OPTION_CONTENT_CLASS = "controlado-champion-option__content";
const CHAMPION_OPTION_ICON_CLASS = "controlado-champion-option__icon";
const CHAMPION_OPTION_NAME_CLASS = "controlado-champion-option__name";

// league dropdown renders its visible control
// inside Shadow DOM, so search styles must be
// injected there.
const DROPDOWN_SEARCH_SHADOW_STYLES = `
    ${LEAGUE_CLIENT_SELECTORS.dropdownRoot} {
        position: relative;
    }

    :host {
        --framed-dropdown-scrollable-max-height: ${DROPDOWN_OPTIONS_HEIGHT_PX}px;
    }

    :host ${LEAGUE_CLIENT_SELECTORS.dropdownRoot} dt${LEAGUE_CLIENT_SELECTORS.dropdownCurrent} {
        display: grid;
        grid-template-columns: minmax(0, 1fr) max-content max-content;
        align-items: center;
        column-gap: 8px;
        padding: 7px 8px 7px 10px;
    }

    :host ${LEAGUE_CLIENT_SELECTORS.dropdownRoot} dt${LEAGUE_CLIENT_SELECTORS.dropdownCurrent}::after {
        display: none;
    }

    :host ${LEAGUE_CLIENT_SELECTORS.dropdownRoot} dt${LEAGUE_CLIENT_SELECTORS.dropdownCurrent} ${LEAGUE_CLIENT_SELECTORS.dropdownCurrentContent} {
        min-width: 0;
        padding: 0;
        text-align: left;
    }

    ${LEAGUE_CLIENT_SELECTORS.dropdownOptionsContainer} {
        position: absolute;
        top: auto;
        bottom: 100%;
        height: ${DROPDOWN_OPTIONS_HEIGHT_PX}px;
        overflow: hidden;
        transform-origin: bottom;
        transform: translateY(0);
    }

    ${LEAGUE_CLIENT_SELECTORS.dropdownOptions},
    ${LEAGUE_CLIENT_SELECTORS.dropdownScrollable} {
        height: ${DROPDOWN_OPTIONS_HEIGHT_PX}px;
    }

    ${LEAGUE_CLIENT_SELECTORS.dropdownOptions} {
        width: 100%;
        box-sizing: border-box;
    }

    ${LEAGUE_CLIENT_SELECTORS.dropdownOptions} ${LEAGUE_CLIENT_SELECTORS.dropdownScrollable} {
        box-sizing: border-box;
    }

    ${LEAGUE_CLIENT_SELECTORS.dropdownOptionsContainer}.${POSITION_FILTER_VISIBLE_CLASS} ${LEAGUE_CLIENT_SELECTORS.dropdownOptions} ${LEAGUE_CLIENT_SELECTORS.dropdownScrollable} {
        padding-top: ${POSITION_FILTER_HEIGHT_PX}px;
    }

    .${POSITION_FILTER_CLASS} {
        position: absolute;
        left: 0;
        right: 0;
        top: 0;
        z-index: 3;
        display: flex;
        align-items: center;
        justify-content: space-between;
        height: ${POSITION_FILTER_HEIGHT_PX}px;
        min-height: ${POSITION_FILTER_HEIGHT_PX}px;
        padding: 0 17px;
        border-bottom: 1px solid #1e282d;
        background: #010a13;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.45);
        box-sizing: border-box;
    }

    .${POSITION_FILTER_BADGE_CLASS} {
        appearance: none;
        display: grid;
        place-items: center;
        flex: 0 0 28px;
        width: 28px;
        height: 28px;
        padding: 0;
        border: 1px solid #463714;
        border-radius: 50%;
        background: #1e2328;
        box-shadow: 0 0 0 1px rgba(1, 10, 19, 0.85);
        box-sizing: border-box;
        cursor: pointer;
        outline: none;
    }

    .${POSITION_FILTER_BADGE_CLASS}:hover,
    .${POSITION_FILTER_BADGE_CLASS}:focus {
        border-color: #c8aa6e;
        background: #0f1b2d;
    }

    .${POSITION_FILTER_BADGE_ACTIVE_CLASS} {
        border-color: #f0e6d2;
        background: #09202c;
        box-shadow: 0 0 0 1px #c89b3c, 0 0 10px rgba(200, 155, 60, 0.45);
    }

    .${POSITION_FILTER_BADGE_CLASS} img {
        display: block;
        width: 18px;
        height: 18px;
        object-fit: contain;
        opacity: 0.72;
        pointer-events: none;
    }

    .${POSITION_FILTER_BADGE_CLASS}:hover img,
    .${POSITION_FILTER_BADGE_CLASS}:focus img,
    .${POSITION_FILTER_BADGE_ACTIVE_CLASS} img {
        opacity: 1;
    }

    .${FILTER_ICON_CLASS} {
        cursor: default;
        display: inline-block;
        flex: 0 0 auto;
        width: 18px;
        height: 18px;
        background-color: #c8aa6e;
        -webkit-mask-image: url('/fe/lol-social/search_mask.png');
        -webkit-mask-repeat: no-repeat;
        -webkit-mask-position: center;
        -webkit-mask-size: 18px 18px;
    }

    .${FILTER_ICON_TRASH_CLASS} {
        cursor: pointer;
        background-color: #c86e6e;
        -webkit-mask-image: url('/fe/lol-uikit/images/icon_delete.png');
        -webkit-mask-size: 12px 12px;
    }

    .${SEARCH_INPUT_CLASS} {
        flex: 0 0 auto;
        min-width: 0;
        width: auto;
        color: inherit;
        background: transparent;
        border: none;
        text-align: left;
        outline: none;
        font-family: inherit;
        font-size: inherit;
        font-weight: inherit;
    }

    .${TAG_CLASS} {
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

    .${SEARCH_TAG_CLASS} {
        border-color: #d7b46a;
        color: #f6e1b2;
        background: #1a232f;
        width: auto;
        min-width: 0;
        box-sizing: border-box;
        justify-content: flex-start;
        justify-self: end;
        order: 2;
        text-transform: none;
        font-weight: 500;
    }

    .${QUICK_ACTION_TOGGLE_CLASS} {
        appearance: none;
        display: inline-grid;
        place-items: center;
        width: 18px;
        height: 18px;
        padding: 0;
        border: 0;
        background: transparent;
        box-sizing: border-box;
        cursor: pointer;
        justify-self: end;
        order: 1;
        outline: none;
    }

    .${QUICK_ACTION_TOGGLE_CLASS}::before {
        content: "";
        display: block;
        width: 16px;
        height: 16px;
        background-color: #785a28;
        -webkit-mask-image: ${QUICK_ACTION_ICON_MASK};
        -webkit-mask-repeat: no-repeat;
        -webkit-mask-position: center;
        -webkit-mask-size: 16px 16px;
        filter: drop-shadow(0 0 1px #010a13);
    }

    .${QUICK_ACTION_TOGGLE_CLASS}:hover::before,
    .${QUICK_ACTION_TOGGLE_CLASS}:focus::before {
        background-color: #c8aa6e;
    }

    .${QUICK_ACTION_TOGGLE_ACTIVE_CLASS}::before {
        background-color: #f0e6d2;
        filter: drop-shadow(0 0 3px rgba(200, 170, 110, 0.75));
    }
`;

/**
 * @param {string} text
 * @returns {HTMLElement}
 */
function createDropdownOption(text) {
    const option = document.createElement(LEAGUE_CLIENT_ELEMENTS.dropdownOption);
    option.setAttribute("slot", LEAGUE_CLIENT_ELEMENTS.dropdownOption);
    option.innerText = text;
    return option;
}

export class ChampionDropdown {
    /**
     * @param {HTMLElement} dropdownElement League client UI framed dropdown custom element.
     * @param {string} placeholderText Text for the reset/placeholder option.
     * @param {ChampionSelectedCallback} onChampionSelected
     * @param {ChampionDropdownOptions} [options]
     */
    constructor(dropdownElement, placeholderText, onChampionSelected, options = {}) {
        this.dropdownElement = dropdownElement;
        this.placeholderText = placeholderText;
        this.searchPlaceholderText = options.searchPlaceholderText || "Search";
        this.quickActionLabel = options.quickActionLabel || "Pick/ban instantly";
        this.isQuickActionEnabled = typeof options.isQuickActionEnabled === "function" ? options.isQuickActionEnabled : null;
        this.onQuickActionToggle = typeof options.onQuickActionToggle === "function" ? options.onQuickActionToggle : null;
        this.onChampionSelected = onChampionSelected;
        this.placeholderOption = null;
        this.searchQuery = "";
        this.activePositionFilter = null;
        this.hasRecommendedPositionData = false;
        /** @type {WeakMap<Element, Set<PositionValue>>} */
        this.recommendedPositionsByOption = new WeakMap();
    }

    /**
     * @param {Champion[]} champions
     * @returns {void}
     */
    renderOptions(champions) {
        this.dropdownElement.replaceChildren();
        this.hasRecommendedPositionData = false;

        this.placeholderOption = createDropdownOption(this.placeholderText);
        this.placeholderOption.setAttribute("selected", "true");
        this.hidePlaceholderOption();
        this.dropdownElement.appendChild(this.placeholderOption);

        for (const champion of champions) {
            const recommendedPositions = this.getChampionRecommendedPositions(champion);
            const option = this.createChampionOption(champion, recommendedPositions);
            if (recommendedPositions.length > 0) {
                this.hasRecommendedPositionData = true;
            }
            this.dropdownElement.appendChild(option);
        }

        if (!this.hasRecommendedPositionData) {
            this.activePositionFilter = null;
        }

        this.applyOptionFilters();
    }

    /**
     * @param {Champion} champion
     * @param {PositionValue[]} recommendedPositions
     * @returns {HTMLElement}
     */
    createChampionOption(champion, recommendedPositions) {
        const option = createDropdownOption("");
        this.recommendedPositionsByOption.set(option, new Set(recommendedPositions));
        option.title = champion.name;
        option.appendChild(this.createChampionOptionContent(champion));
        option.addEventListener("click", () => {
            this.onChampionSelected(champion.id);
            requestAnimationFrame(() => this.reset());
        });

        return option;
    }

    /**
     * @param {Champion} champion
     * @returns {HTMLSpanElement}
     */
    createChampionOptionContent(champion) {
        const content = document.createElement("span");
        content.classList.add(CHAMPION_OPTION_CONTENT_CLASS);

        const icon = document.createElement("img");
        icon.classList.add(CHAMPION_OPTION_ICON_CLASS);
        icon.src = champion.squarePortraitPath;
        icon.alt = "";
        icon.draggable = false;
        icon.loading = "lazy";

        const name = document.createElement("span");
        name.classList.add(CHAMPION_OPTION_NAME_CLASS);
        name.innerText = champion.name;

        content.append(icon, name);
        return content;
    }

    /**
     * @param {Champion} champion
     * @returns {PositionValue[]}
     */
    getChampionRecommendedPositions(champion) {
        return Array.isArray(champion.recommendedPositions) ? champion.recommendedPositions : [];
    }

    /**
     * @returns {Promise<ShadowRoot | null>}
     */
    async waitForRender() {
        for (let attempt = 0; attempt < DROPDOWN_RENDER_ATTEMPTS; attempt++) {
            const root = this.dropdownElement.shadowRoot;
            if (this.dropdownElement.isConnected && root?.querySelector(LEAGUE_CLIENT_SELECTORS.dropdownCurrent)) {
                return root;
            }

            await sleep(DROPDOWN_RENDER_RETRY_DELAY_MS);
        }

        return null;
    }

    /**
     * @param {ShadowRoot} root
     * @returns {void}
     */
    ensureSearchPlaceholder(root) {
        if (root.querySelector(`#${SEARCH_PLACEHOLDER_ID}`)) {
            return;
        }

        const currentDropdown = root.querySelector(LEAGUE_CLIENT_SELECTORS.dropdownCurrent);
        if (!currentDropdown) {
            return;
        }

        currentDropdown.appendChild(this.createSearchPlaceholder());
    }

    /**
     * @param {ShadowRoot} root
     * @returns {void}
     */
    ensureQuickActionToggle(root) {
        if (!this.isQuickActionAvailable() || root.querySelector(`#${QUICK_ACTION_TOGGLE_ID}`)) {
            this.syncQuickActionToggle(root);
            return;
        }

        const currentDropdown = root.querySelector(LEAGUE_CLIENT_SELECTORS.dropdownCurrent);
        if (!currentDropdown) {
            return;
        }

        currentDropdown.appendChild(this.createQuickActionToggle());
        this.syncQuickActionToggle(root);
    }

    /**
     * @param {ShadowRoot} root
     * @returns {void}
     */
    ensurePositionFilter(root) {
        const optionsContainer = root.querySelector(LEAGUE_CLIENT_SELECTORS.dropdownOptionsContainer);
        if (!optionsContainer) {
            return;
        }

        if (!this.hasRecommendedPositionData) {
            root.querySelector(`.${POSITION_FILTER_CLASS}`)?.remove();
            optionsContainer.classList.remove(POSITION_FILTER_VISIBLE_CLASS);
            this.activePositionFilter = null;
            return;
        }

        optionsContainer.classList.add(POSITION_FILTER_VISIBLE_CLASS);

        if (!root.querySelector(`.${POSITION_FILTER_CLASS}`)) {
            optionsContainer.insertBefore(this.createPositionFilter(), optionsContainer.firstChild);
        }

        this.syncPositionFilter(root);
    }

    /**
     * @returns {HTMLDivElement}
     */
    createPositionFilter() {
        const filter = document.createElement("div");
        filter.classList.add(POSITION_FILTER_CLASS);
        filter.setAttribute("role", "toolbar");
        filter.setAttribute("aria-label", "Filter champions by position");

        for (const position of POSITIONS) {
            filter.appendChild(this.createPositionFilterBadge(position));
        }

        return filter;
    }

    /**
     * @param {{value: string, label: string, iconPath: string}} position
     * @returns {HTMLButtonElement}
     */
    createPositionFilterBadge(position) {
        const button = document.createElement("button");
        button.classList.add(POSITION_FILTER_BADGE_CLASS);
        button.type = "button";
        button.dataset.position = position.value;
        button.title = position.label;
        button.setAttribute("aria-label", position.label);
        button.setAttribute("aria-pressed", "false");

        const image = document.createElement("img");
        image.src = position.iconPath;
        image.alt = "";
        image.draggable = false;

        button.appendChild(image);

        button.addEventListener("pointerdown", event => {
            event.preventDefault();
            event.stopPropagation();
        });

        button.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            this.togglePositionFilter(position.value);
        });

        return button;
    }

    /**
     * @returns {HTMLDivElement}
     */
    createSearchPlaceholder() {
        const placeholder = document.createElement("div");
        placeholder.classList.add(TAG_CLASS, SEARCH_TAG_CLASS);
        placeholder.id = SEARCH_PLACEHOLDER_ID;

        const input = document.createElement("input");
        input.classList.add(SEARCH_INPUT_CLASS);
        input.id = SEARCH_INPUT_ID;
        input.type = "text";
        input.placeholder = this.searchPlaceholderText;
        input.setAttribute("aria-label", this.searchPlaceholderText);
        input.size = Math.max(this.searchPlaceholderText.length, 1);

        const filterIcon = document.createElement("span");
        filterIcon.classList.add(FILTER_ICON_CLASS);

        filterIcon.addEventListener("click", () => {
            if (!filterIcon.classList.contains(FILTER_ICON_TRASH_CLASS)) {
                return;
            }

            this.clearSearch(input, filterIcon);
        });

        input.addEventListener("input", event => {
            this.ensureOpen();
            this.setSearchQuery(event.target.value);
            filterIcon.classList.toggle(FILTER_ICON_TRASH_CLASS, Boolean(event.target.value));
        });

        ["pointerdown", "click"].forEach(type => {
            placeholder.addEventListener(type, event => event.stopPropagation());
            filterIcon.addEventListener(type, event => event.stopPropagation());
        });

        ["pointerdown", "focusin"].forEach(type => {
            input.addEventListener(type, event => event.stopPropagation(), true);
        });

        placeholder.appendChild(filterIcon);
        placeholder.appendChild(input);
        return placeholder;
    }

    /**
     * @returns {HTMLButtonElement}
     */
    createQuickActionToggle() {
        const button = document.createElement("button");
        button.classList.add(QUICK_ACTION_TOGGLE_CLASS);
        button.id = QUICK_ACTION_TOGGLE_ID;
        button.type = "button";
        button.title = this.quickActionLabel;
        button.setAttribute("aria-label", this.quickActionLabel);
        button.setAttribute("aria-pressed", "false");

        ["pointerdown", "click"].forEach(type => {
            button.addEventListener(type, event => {
                event.preventDefault();
                event.stopPropagation();
            });
        });

        button.addEventListener("click", () => {
            this.onQuickActionToggle?.();
            this.syncQuickActionToggle();
        });

        return button;
    }

    /**
     * @returns {boolean}
     */
    isQuickActionAvailable() {
        return Boolean(this.isQuickActionEnabled && this.onQuickActionToggle);
    }

    /**
     * @param {ShadowRoot | null} [root]
     * @returns {void}
     */
    syncQuickActionToggle(root = this.dropdownElement.shadowRoot) {
        if (!this.isQuickActionAvailable() || !root) {
            return;
        }

        const button = root.querySelector(`#${QUICK_ACTION_TOGGLE_ID}`);
        if (!button) {
            return;
        }

        const enabled = this.isQuickActionEnabled() === true;
        button.classList.toggle(QUICK_ACTION_TOGGLE_ACTIVE_CLASS, enabled);
        button.setAttribute("aria-pressed", String(enabled));
        button.title = this.quickActionLabel;
        button.setAttribute("aria-label", this.quickActionLabel);
    }

    /**
     * @param {unknown} position
     * @returns {void}
     */
    togglePositionFilter(position) {
        const normalizedPosition = normalizePosition(position);
        if (!normalizedPosition) {
            return;
        }

        this.activePositionFilter = this.activePositionFilter === normalizedPosition ? null : normalizedPosition;
        this.withShadowRoot(root => this.syncPositionFilter(root));
        this.applyOptionFilters();
    }

    /**
     * @param {ShadowRoot} root
     * @returns {void}
     */
    syncPositionFilter(root) {
        root.querySelectorAll(`.${POSITION_FILTER_BADGE_CLASS}`).forEach(button => {
            const active = button.dataset.position === this.activePositionFilter;
            button.classList.toggle(POSITION_FILTER_BADGE_ACTIVE_CLASS, active);
            button.setAttribute("aria-pressed", String(active));
        });
    }

    /**
     * @param {HTMLInputElement} input
     * @param {Element} filterIcon
     * @returns {void}
     */
    clearSearch(input, filterIcon) {
        input.value = "";
        this.setSearchQuery("");
        filterIcon.classList.toggle(FILTER_ICON_TRASH_CLASS, false);
    }

    /**
     * @param {string} query
     * @returns {void}
     */
    setSearchQuery(query) {
        this.searchQuery = query;
        this.applyOptionFilters();
    }

    applyOptionFilters() {
        const normalizedQuery = this.searchQuery.toLowerCase();
        const options = this.dropdownElement.querySelectorAll(LEAGUE_CLIENT_SELECTORS.dropdownOption);
        options.forEach(option => {
            if (option === this.placeholderOption) {
                this.hidePlaceholderOption();
                return;
            }

            if (this.matchesSearchQuery(option, normalizedQuery) && this.matchesPositionFilter(option)) {
                option.style.display = "";
            } else {
                option.style.display = "none";
            }
        });
    }

    /**
     * @param {Element} option
     * @param {string} normalizedQuery
     * @returns {boolean}
     */
    matchesSearchQuery(option, normalizedQuery) {
        return (option.textContent ?? "").toLowerCase().includes(normalizedQuery);
    }

    /**
     * @param {Element} option
     * @returns {boolean}
     */
    matchesPositionFilter(option) {
        if (!this.activePositionFilter) {
            return true;
        }

        return this.recommendedPositionsByOption.get(option)?.has(this.activePositionFilter) === true;
    }

    hidePlaceholderOption() {
        if (this.placeholderOption) {
            this.placeholderOption.style.display = "none";
        }
    }

    reset() {
        this.dropdownElement.querySelectorAll(LEAGUE_CLIENT_SELECTORS.dropdownOptionSelected).forEach(option => {
            option.removeAttribute("selected");
        });
        this.placeholderOption?.setAttribute("selected", "true");

        this.withShadowRoot(root => {
            const input = root.querySelector(`#${SEARCH_INPUT_ID}`);
            const trashFilterIcon = root.querySelector(`.${FILTER_ICON_TRASH_CLASS}`);
            if (input && trashFilterIcon) {
                this.clearSearch(input, trashFilterIcon);
            } else {
                if (input) {
                    input.value = "";
                    this.setSearchQuery("");
                }

                if (trashFilterIcon) {
                    trashFilterIcon.classList.remove(FILTER_ICON_TRASH_CLASS);
                }
            }

            if (this.isOpen()) {
                root.querySelector(LEAGUE_CLIENT_SELECTORS.dropdownCurrent)?.click();
            }
        });
    }

    isOpen() {
        return this.dropdownElement.classList.contains("active");
    }

    ensureOpen() {
        if (this.isOpen()) {
            return;
        }

        this.withShadowRoot(root => {
            const internalDropdown = root.querySelector(LEAGUE_CLIENT_SELECTORS.dropdownCurrent);
            if (internalDropdown) {
                internalDropdown.click();
            }
        });
    }

    patchDropdownShadowDom() {
        this.withShadowRoot(root => {
            this.ensureDropdownOpensUpward(root);
            this.injectDropdownSearchStyles(root);
            this.ensurePositionFilter(root);
        });
    }

    /**
     * @param {ShadowRoot | Element} element
     * @returns {void}
     */
    ensureDropdownOpensUpward(element) {
        element.querySelector(LEAGUE_CLIENT_SELECTORS.dropdownRoot)?.classList.add("opens-upward");
    }

    /**
     * @param {ShadowRoot | Element} element
     * @returns {void}
     */
    injectDropdownSearchStyles(element) {
        const existingStyle = element.querySelector("style[data-controlado='dropdown-tags']");
        if (existingStyle) {
            existingStyle.textContent = DROPDOWN_SEARCH_SHADOW_STYLES;
            return;
        }

        const style = document.createElement("style");
        style.dataset.controlado = "dropdown-tags";
        style.textContent = DROPDOWN_SEARCH_SHADOW_STYLES;
        element.appendChild(style);
    }

    /**
     * @param {(root: ShadowRoot) => void} callback
     * @returns {void}
     */
    withShadowRoot(callback) {
        const root = this.dropdownElement.shadowRoot;
        if (!root) {
            return;
        }

        callback(root);
    }
}
