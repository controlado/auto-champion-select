import { sleep } from "https://cdn.jsdelivr.net/npm/balaclava-utils@latest";
import { LEAGUE_CLIENT_ELEMENTS, LEAGUE_CLIENT_SELECTORS } from "./league-client-dom.js";

/**
 * @typedef {{id: number, name: string, squarePortraitPath: string}} Champion
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

const SEARCH_PLACEHOLDER_ID = "controlado-placeholder";
const SEARCH_INPUT_ID = "controlado-search";
const QUICK_ACTION_TOGGLE_ID = "controlado-quick-action";

const FILTER_ICON_CLASS = "controlado-filter-icon";
const FILTER_ICON_TRASH_CLASS = "controlado-filter-icon--trash";
const SEARCH_INPUT_CLASS = "controlado-filter-input";
const QUICK_ACTION_TOGGLE_CLASS = "controlado-quick-action-toggle";
const QUICK_ACTION_TOGGLE_ACTIVE_CLASS = "controlado-quick-action-toggle--active";
const TAG_CLASS = "controlado-tag";
const SEARCH_TAG_CLASS = "controlado-tag--search";
const CHAMPION_OPTION_CLASS = "controlado-champion-option";
const CHAMPION_OPTION_CONTENT_CLASS = "controlado-champion-option__content";
const CHAMPION_OPTION_ICON_CLASS = "controlado-champion-option__icon";
const CHAMPION_OPTION_NAME_CLASS = "controlado-champion-option__name";

const QUICK_ACTION_ICON_MASK = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='black' d='M13.1 2 4 13.2h6.7L9.9 22 20 9.8h-6.9L13.1 2z'/%3E%3C/svg%3E\")";

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
    }

    /**
     * @param {Champion[]} champions
     * @returns {void}
     */
    renderOptions(champions) {
        this.dropdownElement.replaceChildren();

        this.placeholderOption = createDropdownOption(this.placeholderText);
        this.placeholderOption.setAttribute("selected", "true");
        this.hidePlaceholderOption();
        this.dropdownElement.appendChild(this.placeholderOption);

        for (const champion of champions) {
            const option = this.createChampionOption(champion);
            this.dropdownElement.appendChild(option);
        }
    }

    /**
     * @param {Champion} champion
     * @returns {HTMLElement}
     */
    createChampionOption(champion) {
        const option = createDropdownOption("");
        option.classList.add(CHAMPION_OPTION_CLASS);
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
            this.filterOptions(event.target.value);
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
     * @param {HTMLInputElement} input
     * @param {Element} filterIcon
     * @returns {void}
     */
    clearSearch(input, filterIcon) {
        input.value = "";
        this.filterOptions("");
        filterIcon.classList.toggle(FILTER_ICON_TRASH_CLASS, false);
    }

    /**
     * @param {string} query
     * @returns {void}
     */
    filterOptions(query) {
        const normalizedQuery = query.toLowerCase();
        const options = this.dropdownElement.querySelectorAll(LEAGUE_CLIENT_SELECTORS.dropdownOption);
        options.forEach(option => {
            if (option === this.placeholderOption) {
                this.hidePlaceholderOption();
                return;
            }

            if ((option.textContent ?? "").toLowerCase().includes(normalizedQuery)) {
                option.style.display = "";
            } else {
                option.style.display = "none";
            }
        });
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
                    this.filterOptions("");
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
