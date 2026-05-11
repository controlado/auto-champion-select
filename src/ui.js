import { sleep } from "https://cdn.jsdelivr.net/npm/balaclava-utils@latest";
import { ensureConfig, patchConfig } from "./config-store.js";
import { getChampSelectButtonsContainer, LEAGUE_CLIENT_ELEMENTS, LEAGUE_CLIENT_SELECTORS } from "./league-client-dom.js";

/**
 * @callback ReturnControlsToSocialRoster
 * @returns {void | Promise<void>}
 */

const CHAMP_SELECT_BUTTON_RETRY_DELAY_MS = 200;

const CHAMP_SELECT_MENU_COLLAPSED_CLASS = "auto-select-champ-select-menu--collapsed";
const CHAMP_SELECT_MENU_OPEN_WRAPPER_CLASS = "auto-select-champ-select-menu-button-wrapper--open";

export class ConfigToggle {
    /**
     * @param {string} text
     * @param {"controladoAutoAccept" | "controladoPick" | "controladoBan"} configKey
     */
    constructor(text, configKey) {
        this.element = document.createElement(LEAGUE_CLIENT_ELEMENTS.radioInputOption);
        this.element.classList.add("lol-settings-voice-input-mode-option", "auto-select-checkbox");
        this.element.innerText = text;

        this.config = null;
        this.configKey = configKey;
        this.setupComplete = false;
    }

    /**
     * @returns {void}
     */
    setup() {
        this.syncFromConfig();

        if (!this.setupComplete) {
            this.element.addEventListener("click", () => this.toggle());
            this.setupComplete = true;
        }
    }

    /**
     * @returns {void}
     */
    syncFromConfig() {
        this.config = ensureConfig(this.configKey);
        this.element.toggleAttribute("selected", this.config.enabled === true);
    }

    /**
     * @returns {boolean} The config enabled state after toggling.
     */
    toggle() {
        console.debug("auto-champion-select: Toggling", this.configKey);
        this.config = patchConfig(this.configKey, config => {
            config.enabled = !config.enabled;
            return config;
        });
        this.element.toggleAttribute("selected", this.config.enabled === true);
        return this.config.enabled;
    }
}

export class ChampSelectControlsMenu {
    /**
     * @param {string} label
     * @param {ReturnControlsToSocialRoster} returnControlsToSocialRoster
     * @param {HTMLElement[]} controlElements Elements moved between social roster and champion select menu.
     */
    constructor(label, returnControlsToSocialRoster, controlElements) {
        this.element = document.createElement("div");
        this.element.classList.add("auto-select-champ-select-menu", CHAMP_SELECT_MENU_COLLAPSED_CLASS);

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

        this.returnControlsToSocialRoster = returnControlsToSocialRoster;
        this.controlElements = controlElements;
        this.boundCloseOnOutsideInteraction = event => this.closeOnOutsideInteraction(event);
        this.buttonObserver = null;
        this.buttonMountFrame = null;
        this.buttonMountTask = null;
        this.hiddenStates = new WeakMap();
        this.mounted = false;
    }

    /**
     * Moves the shared controls into the champion select menu and mounts the menu button.
     *
     * @returns {Promise<void>}
     */
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

    /**
     * Moves the shared controls back to the social roster and removes champion select listeners.
     *
     * @returns {void | Promise<void>}
     */
    unmount() {
        if (!this.mounted) {
            return this.returnControlsToSocialRoster();
        }
        this.mounted = false;

        this.stopButtonMounting();
        document.removeEventListener("pointerdown", this.boundCloseOnOutsideInteraction, true);

        this.setOpen(false);
        this.buttonWrapper.remove();
        this.restoreHiddenStates();

        return this.returnControlsToSocialRoster();
    }

    stopButtonMounting() {
        this.buttonObserver?.disconnect();
        this.buttonObserver = null;
        if (this.buttonMountFrame !== null) {
            cancelAnimationFrame(this.buttonMountFrame);
            this.buttonMountFrame = null;
        }
        this.buttonMountTask = null;
    }

    restoreHiddenStates() {
        this.controlElements.forEach(element => {
            element.classList.toggle("hidden", this.hiddenStates.get(element) === true);
            this.hiddenStates.delete(element);
        });
    }

    isOpen() {
        return !this.element.classList.contains(CHAMP_SELECT_MENU_COLLAPSED_CLASS);
    }

    /**
     * @param {boolean} open
     * @returns {void}
     */
    setOpen(open) {
        this.element.classList.toggle(CHAMP_SELECT_MENU_COLLAPSED_CLASS, !open);
        this.buttonWrapper.classList.toggle(CHAMP_SELECT_MENU_OPEN_WRAPPER_CLASS, open);
        this.headerElement.setAttribute("aria-expanded", String(open));
    }

    toggle() {
        this.setOpen(!this.isOpen());
    }

    /**
     * @param {PointerEvent} event
     * @returns {void}
     */
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

    /**
     * @returns {Promise<void>}
     */
    mountButton() {
        if (!this.buttonMountTask) {
            this.buttonMountTask = this.appendButtonToContainer()
                .finally(() => {
                    this.buttonMountTask = null;
                });
        }

        return this.buttonMountTask;
    }

    /**
     * @returns {Promise<void>}
     */
    async appendButtonToContainer() {
        let buttonContainer = getChampSelectButtonsContainer();
        while (this.mounted && !buttonContainer) {
            await sleep(CHAMP_SELECT_BUTTON_RETRY_DELAY_MS);
            buttonContainer = getChampSelectButtonsContainer();
        }

        if (!this.mounted || !buttonContainer) {
            return;
        }

        const firstSquareButton = buttonContainer.querySelector(
            LEAGUE_CLIENT_SELECTORS.firstChampSelectSquareButton
        );

        if (this.buttonWrapper.parentNode === buttonContainer && this.buttonWrapper.nextSibling === firstSquareButton) {
            return;
        }

        buttonContainer.insertBefore(this.buttonWrapper, firstSquareButton);
    }
}

export class SocialRosterSection {
    /**
     * @param {string} label
     * @param {...HTMLElement} collapsibleElements
     */
    constructor(label, ...collapsibleElements) {
        this.element = document.createElement(LEAGUE_CLIENT_ELEMENTS.socialRosterGroup);
        this.element.addEventListener("post-render", () => this.onPostRender());
        this.element.addEventListener("click", () => this.onClick());

        this.label = label;
        this.collapsibleElements = collapsibleElements;

        this.waitRender();
    }

    waitRender() {
        new MutationObserver((_, observer) => {
            if (this.element.querySelector(LEAGUE_CLIENT_SELECTORS.socialRosterGroupLabel)) {
                const newEvent = new Event("post-render");
                this.element.dispatchEvent(newEvent);
                observer.disconnect();
            }
        }).observe(this.element, { childList: true });
    }

    onPostRender() {
        this.element.querySelector(LEAGUE_CLIENT_SELECTORS.socialRosterGroupLabel).innerText = this.label;
        this.element.querySelector(LEAGUE_CLIENT_SELECTORS.socialRosterGroupHeader)?.removeAttribute("draggable");
    }

    onClick() {
        this.collapsibleElements.forEach(element => {
            if (!element.closest(".auto-select-champ-select-menu")) {
                element.classList.toggle("hidden");
            }
        });
        this.element.querySelector(LEAGUE_CLIENT_SELECTORS.socialRosterGroupArrow)?.toggleAttribute("open");
    }
}
