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
const SOCIAL_ROSTER_SECTION_CLASS = "auto-select-social-roster-section";
const SOCIAL_ROSTER_SECTION_HEADER_CLASS = "auto-select-social-roster-section__header";
const SETTINGS_TRIGGER_CLASS = "auto-select-settings-trigger";
const SETTINGS_FLYOUT_CLASS = "auto-select-settings-flyout";
const SETTINGS_MENU_CLASS = "auto-select-settings-menu";
const SETTINGS_EMPTY_CLASS = "auto-select-settings-menu__empty";
const SETTINGS_CHECKBOX_CLASS = "auto-select-settings-checkbox";
const SETTINGS_RANGE_CLASS = "auto-select-settings-range";
const SETTINGS_RANGE_HEADER_CLASS = "auto-select-settings-range__header";
const SETTINGS_RANGE_LABEL_CLASS = "auto-select-settings-range__label";
const SETTINGS_RANGE_VALUE_CLASS = "auto-select-settings-range__value";
const SETTINGS_RANGE_TRACK_CLASS = "auto-select-settings-range__track";
const SETTINGS_RANGE_FILL_CLASS = "auto-select-settings-range__fill";
const SETTINGS_RANGE_HANDLE_CLASS = "auto-select-settings-range__handle";
const SETTINGS_RANGE_HANDLE_MIN_CLASS = "auto-select-settings-range__handle--min";
const SETTINGS_RANGE_HANDLE_MAX_CLASS = "auto-select-settings-range__handle--max";

/**
 * @typedef {Object} SettingsControl
 * @property {HTMLElement} element
 * @property {() => void} [setup]
 * @property {() => void} [sync]
 *
 * @typedef {Object} SettingsCheckboxOptions
 * @property {() => boolean} isSelected
 * @property {() => void} toggle
 *
 * @typedef {Object} SettingsRangeValue
 * @property {number} min
 * @property {number} max
 *
 * @typedef {Object} SettingsDualRangeOptions
 * @property {number} min
 * @property {number} max
 * @property {number} step
 * @property {() => SettingsRangeValue} getValue
 * @property {(value: SettingsRangeValue) => void} setValue
 * @property {(value: SettingsRangeValue) => string} formatValue
 */

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
        this.titleAccessoryElement = null;

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

    /**
     * @param {HTMLElement} element
     * @returns {void}
     */
    setTitleAccessory(element) {
        this.titleAccessoryElement = element;
        if (!element.isConnected || element.parentNode !== this.titleElement) {
            this.titleElement.appendChild(element);
        }
    }
}

export class SettingsMenu {
    /**
     * @param {SettingsControl[]} [controls]
     */
    constructor(controls = []) {
        this.controls = controls;
        this.triggerElements = new Set();
        this.flyoutElement = this.createFlyoutElement();
        this.open = false;
        this.activeTriggerElement = null;
        this.setupComplete = false;

        this.boundCloseOnOutsideInteraction = event => this.closeOnOutsideInteraction(event);
        this.boundCloseOnEscape = event => this.closeOnEscape(event);
        this.boundPositionFlyout = () => this.positionFlyout();

        this.renderControls();
    }

    /**
     * @returns {void}
     */
    setup() {
        this.ensureFlyoutConnected();
        this.controls.forEach(control => control.setup?.());
        this.sync();

        if (this.setupComplete) {
            return;
        }

        document.addEventListener("pointerdown", this.boundCloseOnOutsideInteraction, true);
        document.addEventListener("keydown", this.boundCloseOnEscape, true);
        window.addEventListener("resize", this.boundPositionFlyout);
        this.setupComplete = true;
    }

    /**
     * @param {SettingsControl[]} controls
     * @returns {void}
     */
    setControls(controls) {
        this.controls = controls;
        this.renderControls();
        if (this.setupComplete) {
            this.controls.forEach(control => control.setup?.());
        }
        this.sync();
    }

    /**
     * @param {string} [label]
     * @returns {HTMLButtonElement}
     */
    createTriggerElement(label = "Auto champion select settings") {
        const button = document.createElement("button");
        button.type = "button";
        button.classList.add(SETTINGS_TRIGGER_CLASS);
        button.dataset.autoSelectSettings = "trigger";
        button.setAttribute("aria-label", label);
        button.setAttribute("aria-expanded", "false");
        button.title = label;
        button.addEventListener("click", event => {
            event.preventDefault();
            event.stopImmediatePropagation();
            event.stopPropagation();
            this.toggleFlyout(button);
        }, true);

        this.triggerElements.add(button);
        return button;
    }

    /**
     * @returns {HTMLElement}
     */
    createFlyoutElement() {
        const flyout = document.createElement("lol-uikit-flyout-frame");
        flyout.classList.add("flyout", SETTINGS_FLYOUT_CLASS);
        flyout.dataset.autoSelectSettings = "flyout";
        flyout.setAttribute("orientation", "bottom");
        flyout.setAttribute("animated", "true");
        flyout.setAttribute("caretless", "true");
        flyout.style.position = "fixed";
        flyout.style.overflow = "visible";
        flyout.style.display = "none";

        const content = document.createElement("lc-flyout-content");
        const menu = document.createElement("div");
        menu.classList.add("social-options-menu", "active", SETTINGS_MENU_CLASS);

        content.appendChild(menu);
        flyout.appendChild(content);

        return flyout;
    }

    /**
     * @returns {void}
     */
    renderControls() {
        const menu = this.flyoutElement.querySelector(`.${SETTINGS_MENU_CLASS}`);
        if (!menu) {
            return;
        }

        menu.replaceChildren();

        if (this.controls.length === 0) {
            const emptyElement = document.createElement("div");
            emptyElement.classList.add(SETTINGS_EMPTY_CLASS);
            emptyElement.textContent = "No settings available";
            menu.appendChild(emptyElement);
            return;
        }

        menu.append(...this.controls.map(control => control.element));
    }

    /**
     * @returns {void}
     */
    sync() {
        this.controls.forEach(control => control.sync?.());
    }

    /**
     * @returns {void}
     */
    ensureFlyoutConnected() {
        document.querySelectorAll(`.${SETTINGS_FLYOUT_CLASS}`).forEach(element => {
            if (element !== this.flyoutElement) {
                element.remove();
            }
        });

        if (!this.flyoutElement.isConnected) {
            document.body.appendChild(this.flyoutElement);
        }
    }

    /**
     * @returns {boolean}
     */
    isOpen() {
        return this.open && this.flyoutElement.isConnected && getComputedStyle(this.flyoutElement).display !== "none";
    }

    /**
     * @param {boolean} open
     * @param {HTMLElement | null} [triggerElement]
     * @returns {void}
     */
    setOpen(open, triggerElement = this.activeTriggerElement) {
        this.open = open;
        this.activeTriggerElement = open ? triggerElement : null;
        this.ensureFlyoutConnected();
        this.flyoutElement.style.display = open ? "block" : "none";
        this.flyoutElement.toggleAttribute("show", open);

        this.triggerElements.forEach(button => {
            button.setAttribute("aria-expanded", String(open && button === this.activeTriggerElement));
        });

        if (open) {
            this.sync();
            this.positionFlyout();
        }
    }

    /**
     * @param {HTMLElement} triggerElement
     * @returns {void}
     */
    toggleFlyout(triggerElement) {
        const shouldOpen = !this.isOpen() || this.activeTriggerElement !== triggerElement;
        this.setOpen(shouldOpen, triggerElement);
    }

    /**
     * @returns {void}
     */
    positionFlyout() {
        if (!this.isOpen() || !this.activeTriggerElement) {
            return;
        }

        const triggerRect = this.activeTriggerElement.getBoundingClientRect();
        const flyoutWidth = Math.min(280, window.innerWidth - 16);
        this.flyoutElement.style.width = `${flyoutWidth}px`;

        const flyoutRect = this.flyoutElement.getBoundingClientRect();
        const preferredLeft = triggerRect.right - flyoutWidth + 4;
        const left = Math.max(8, Math.min(window.innerWidth - flyoutWidth - 8, preferredLeft));
        const preferredTop = triggerRect.bottom + 4;
        const top = preferredTop + flyoutRect.height <= window.innerHeight - 8
            ? preferredTop
            : Math.max(8, triggerRect.top - flyoutRect.height - 4);

        this.flyoutElement.style.left = `${Math.round(left)}px`;
        this.flyoutElement.style.top = `${Math.round(top)}px`;
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
        const clickedTrigger = [...this.triggerElements].some(button => path.includes(button));
        const clickedInsideFlyout = path.includes(this.flyoutElement);

        if (!clickedTrigger && !clickedInsideFlyout) {
            this.setOpen(false);
        }
    }

    /**
     * @param {KeyboardEvent} event
     * @returns {void}
     */
    closeOnEscape(event) {
        if (event.key === "Escape" && this.isOpen()) {
            this.setOpen(false);
        }
    }
}

export class SettingsCheckbox {
    /**
     * @param {string} label
     * @param {SettingsCheckboxOptions} options
     */
    constructor(label, options) {
        this.label = label;
        this.options = options;
        this.element = document.createElement(LEAGUE_CLIENT_ELEMENTS.radioInputOption);
        this.element.classList.add("lol-settings-voice-input-mode-option", SETTINGS_CHECKBOX_CLASS);
        this.element.textContent = label;
        this.element.title = label;
        this.setupComplete = false;
    }

    /**
     * @returns {void}
     */
    setup() {
        this.sync();

        if (this.setupComplete) {
            return;
        }

        this.element.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            this.options.toggle();
            this.sync();
        });
        this.setupComplete = true;
    }

    /**
     * @returns {void}
     */
    sync() {
        this.element.toggleAttribute("selected", this.options.isSelected() === true);
    }
}

export class SettingsDualRange {
    /**
     * @param {string} label
     * @param {SettingsDualRangeOptions} options
     */
    constructor(label, options) {
        this.label = label;
        this.options = options;
        this.dragHandle = null;
        this.setupComplete = false;
        this.boundPointerMove = event => this.onPointerMove(event);
        this.boundPointerUp = () => this.stopDragging();

        this.element = document.createElement("div");
        this.element.classList.add(SETTINGS_RANGE_CLASS);

        const header = document.createElement("div");
        header.classList.add(SETTINGS_RANGE_HEADER_CLASS);

        this.labelElement = document.createElement("span");
        this.labelElement.classList.add(SETTINGS_RANGE_LABEL_CLASS);
        this.labelElement.textContent = label;

        this.valueElement = document.createElement("span");
        this.valueElement.classList.add(SETTINGS_RANGE_VALUE_CLASS);

        this.trackElement = document.createElement("div");
        this.trackElement.classList.add(SETTINGS_RANGE_TRACK_CLASS);

        this.fillElement = document.createElement("div");
        this.fillElement.classList.add(SETTINGS_RANGE_FILL_CLASS);

        this.minHandleElement = this.createHandle("min");
        this.maxHandleElement = this.createHandle("max");

        header.append(this.labelElement, this.valueElement);
        this.trackElement.append(this.fillElement, this.minHandleElement, this.maxHandleElement);
        this.element.append(header, this.trackElement);
    }

    /**
     * @returns {void}
     */
    setup() {
        this.sync();

        if (this.setupComplete) {
            return;
        }

        this.trackElement.addEventListener("pointerdown", event => this.onTrackPointerDown(event));
        this.minHandleElement.addEventListener("pointerdown", event => this.startDragging(event, "min"));
        this.maxHandleElement.addEventListener("pointerdown", event => this.startDragging(event, "max"));
        this.minHandleElement.addEventListener("keydown", event => this.onHandleKeyDown(event, "min"));
        this.maxHandleElement.addEventListener("keydown", event => this.onHandleKeyDown(event, "max"));
        this.setupComplete = true;
    }

    /**
     * @param {"min" | "max"} handle
     * @returns {HTMLButtonElement}
     */
    createHandle(handle) {
        const button = document.createElement("button");
        button.type = "button";
        button.classList.add(
            SETTINGS_RANGE_HANDLE_CLASS,
            handle === "min" ? SETTINGS_RANGE_HANDLE_MIN_CLASS : SETTINGS_RANGE_HANDLE_MAX_CLASS
        );
        button.setAttribute("aria-label", `${this.label} ${handle}`);
        button.setAttribute("aria-valuemin", String(this.options.min));
        button.setAttribute("aria-valuemax", String(this.options.max));
        button.setAttribute("role", "slider");
        return button;
    }

    /**
     * @returns {SettingsRangeValue}
     */
    getNormalizedValue() {
        const value = this.options.getValue();
        const min = this.snapValue(value.min);
        const max = this.snapValue(value.max);
        return {
            min: Math.min(min, max),
            max: Math.max(min, max)
        };
    }

    /**
     * @param {number} value
     * @returns {number}
     */
    snapValue(value) {
        const rangeMin = this.options.min;
        const rangeMax = this.options.max;
        const step = this.options.step;
        const numericValue = Number(value);
        const safeValue = Number.isFinite(numericValue) ? numericValue : rangeMin;
        const steppedValue = Math.round((safeValue - rangeMin) / step) * step + rangeMin;
        return Math.max(rangeMin, Math.min(rangeMax, steppedValue));
    }

    /**
     * @returns {void}
     */
    sync() {
        const value = this.getNormalizedValue();
        const minPercent = this.valueToPercent(value.min);
        const maxPercent = this.valueToPercent(value.max);

        this.valueElement.textContent = this.options.formatValue(value);
        this.fillElement.style.left = `${minPercent}%`;
        this.fillElement.style.width = `${maxPercent - minPercent}%`;
        this.minHandleElement.style.left = `${minPercent}%`;
        this.maxHandleElement.style.left = `${maxPercent}%`;

        this.syncHandle(this.minHandleElement, value.min);
        this.syncHandle(this.maxHandleElement, value.max);
    }

    /**
     * @param {HTMLButtonElement} handleElement
     * @param {number} value
     * @returns {void}
     */
    syncHandle(handleElement, value) {
        handleElement.setAttribute("aria-valuenow", String(value));
        handleElement.setAttribute("aria-valuetext", this.options.formatValue({ min: value, max: value }));
    }

    /**
     * @param {number} value
     * @returns {number}
     */
    valueToPercent(value) {
        const range = this.options.max - this.options.min;
        return range <= 0 ? 0 : ((value - this.options.min) / range) * 100;
    }

    /**
     * @param {number} clientX
     * @returns {number}
     */
    clientXToValue(clientX) {
        const rect = this.trackElement.getBoundingClientRect();
        const percentage = rect.width <= 0 ? 0 : (clientX - rect.left) / rect.width;
        return this.snapValue(this.options.min + (this.options.max - this.options.min) * percentage);
    }

    /**
     * @param {PointerEvent} event
     * @returns {void}
     */
    onTrackPointerDown(event) {
        if (event.target === this.minHandleElement || event.target === this.maxHandleElement) {
            return;
        }

        const value = this.clientXToValue(event.clientX);
        const currentValue = this.getNormalizedValue();
        const nearestHandle = Math.abs(value - currentValue.min) <= Math.abs(value - currentValue.max) ? "min" : "max";
        this.startDragging(event, nearestHandle);
        this.setHandleValue(nearestHandle, value);
    }

    /**
     * @param {PointerEvent} event
     * @param {"min" | "max"} handle
     * @returns {void}
     */
    startDragging(event, handle) {
        event.preventDefault();
        event.stopPropagation();
        this.dragHandle = handle;
        document.addEventListener("pointermove", this.boundPointerMove, true);
        document.addEventListener("pointerup", this.boundPointerUp, true);
    }

    /**
     * @param {PointerEvent} event
     * @returns {void}
     */
    onPointerMove(event) {
        if (!this.dragHandle) {
            return;
        }

        event.preventDefault();
        this.setHandleValue(this.dragHandle, this.clientXToValue(event.clientX));
    }

    /**
     * @returns {void}
     */
    stopDragging() {
        this.dragHandle = null;
        document.removeEventListener("pointermove", this.boundPointerMove, true);
        document.removeEventListener("pointerup", this.boundPointerUp, true);
    }

    /**
     * @param {KeyboardEvent} event
     * @param {"min" | "max"} handle
     * @returns {void}
     */
    onHandleKeyDown(event, handle) {
        const currentValue = this.getNormalizedValue();
        const currentHandleValue = handle === "min" ? currentValue.min : currentValue.max;
        let nextValue = currentHandleValue;

        if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
            nextValue -= this.options.step;
        } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
            nextValue += this.options.step;
        } else if (event.key === "Home") {
            nextValue = this.options.min;
        } else if (event.key === "End") {
            nextValue = this.options.max;
        } else {
            return;
        }

        event.preventDefault();
        this.setHandleValue(handle, nextValue);
    }

    /**
     * @param {"min" | "max"} handle
     * @param {number} value
     * @returns {void}
     */
    setHandleValue(handle, value) {
        const currentValue = this.getNormalizedValue();
        const snappedValue = this.snapValue(value);
        const nextValue = handle === "min"
            ? { min: Math.min(snappedValue, currentValue.max), max: currentValue.max }
            : { min: currentValue.min, max: Math.max(snappedValue, currentValue.min) };

        this.options.setValue(nextValue);
        this.sync();
    }
}

export class SocialRosterSection {
    /**
     * @param {string} label
     * @param {...HTMLElement} collapsibleElements
     */
    constructor(label, ...collapsibleElements) {
        this.element = document.createElement(LEAGUE_CLIENT_ELEMENTS.socialRosterGroup);
        this.element.classList.add(SOCIAL_ROSTER_SECTION_CLASS);
        this.element.addEventListener("post-render", () => this.onPostRender());
        this.element.addEventListener("click", () => this.onClick());

        this.label = label;
        this.collapsibleElements = collapsibleElements;
        this.headerAccessoryElement = null;

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
        const headerElement = this.element.querySelector(LEAGUE_CLIENT_SELECTORS.socialRosterGroupHeader);
        headerElement?.removeAttribute("draggable");
        if (headerElement && this.headerAccessoryElement) {
            headerElement.classList.add(SOCIAL_ROSTER_SECTION_HEADER_CLASS);
            headerElement.appendChild(this.headerAccessoryElement);
        }
    }

    /**
     * @param {HTMLElement} element
     * @returns {void}
     */
    setHeaderAccessory(element) {
        this.headerAccessoryElement = element;
        const headerElement = this.element.querySelector(LEAGUE_CLIENT_SELECTORS.socialRosterGroupHeader);
        if (headerElement) {
            headerElement.classList.add(SOCIAL_ROSTER_SECTION_HEADER_CLASS);
            headerElement.appendChild(element);
        }
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
