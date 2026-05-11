import { sleep } from "https://cdn.jsdelivr.net/npm/balaclava-utils@latest";
import { LEAGUE_CLIENT_ELEMENTS, LEAGUE_CLIENT_SELECTORS } from "./league-client-dom.js";

/**
 * @typedef {{id: number, name: string, squarePortraitPath: string}} Champion
 * @callback ChampionSelectedCallback
 * @param {number} championId
 * @returns {void}
 */

const DROPDOWN_RENDER_ATTEMPTS = 50;
const DROPDOWN_RENDER_RETRY_DELAY_MS = 100;

const SEARCH_PLACEHOLDER_ID = "controlado-placeholder";
const SEARCH_INPUT_ID = "controlado-search";

const FILTER_ICON_CLASS = "controlado-filter-icon";
const FILTER_ICON_TRASH_CLASS = "controlado-filter-icon--trash";
const SEARCH_INPUT_CLASS = "controlado-filter-input";
const TAG_CLASS = "controlado-tag";
const SEARCH_TAG_CLASS = "controlado-tag--search";

// league dropdown renders its visible control
// inside Shadow DOM, so search styles must be
// injected there.
const DROPDOWN_SEARCH_SHADOW_STYLES = `
    ${LEAGUE_CLIENT_SELECTORS.dropdownCurrent} {
        display: flex;
        justify-content: space-between;
        padding-right: 28px;
    }

    ${LEAGUE_CLIENT_SELECTORS.dropdownOptionsContainer} {
        top: auto;
        bottom: 100%;
        transform-origin: bottom;
        transform: translateY(0);
    }

    ${LEAGUE_CLIENT_SELECTORS.dropdownScrollable} {
        max-height: 250px;
    }

    .${FILTER_ICON_CLASS} {
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

    .${FILTER_ICON_TRASH_CLASS} {
        cursor: pointer;
        background-color: #c86e6e;
        -webkit-mask-image: url('/fe/lol-uikit/images/icon_delete.png');
        -webkit-mask-size: 12px 12px;
    }

    .${SEARCH_INPUT_CLASS} {
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
        text-transform: none;
        font-weight: 500;
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
     */
    constructor(dropdownElement, placeholderText, onChampionSelected) {
        this.dropdownElement = dropdownElement;
        this.placeholderText = placeholderText;
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
        const option = createDropdownOption(champion.name);
        option.addEventListener("click", () => {
            this.onChampionSelected(champion.id);
            requestAnimationFrame(() => this.reset());
        });

        return option;
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
        input.placeholder = "Search";

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
            if ((option.textContent ?? "").toLowerCase().includes(normalizedQuery)) {
                option.style.display = "";
            } else {
                option.style.display = "none";
            }
        });
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
            this.injectDropdownSearchStyles(root);
        });
    }

    /**
     * @param {ShadowRoot | Element} element
     * @returns {void}
     */
    injectDropdownSearchStyles(element) {
        if (element.querySelector("style[data-controlado='dropdown-tags']")) {
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
