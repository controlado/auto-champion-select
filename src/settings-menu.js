import { LEAGUE_CLIENT_ELEMENTS } from "./league-client-dom.js";
import { t } from "./i18n/index.js";

const SETTINGS_FLYOUT_WIDTH_PX = 224;
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
const SETTINGS_RANGE_HANDLE_DRAGGING_CLASS = "auto-select-settings-range__handle--dragging";

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
    createTriggerElement(label = t("settings.triggerLabel")) {
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
            emptyElement.textContent = t("settings.empty");
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
        const flyoutWidth = Math.min(SETTINGS_FLYOUT_WIDTH_PX, window.innerWidth - 16);
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
        this.dragStartedCollapsed = false;
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
        button.setAttribute("aria-label", t("settings.handleLabel", {
            label: this.label,
            handle: t(`settings.handles.${handle}`)
        }));
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
        const currentValue = this.getNormalizedValue();
        this.dragStartedCollapsed = currentValue.min === currentValue.max;
        this.syncDraggingHandle();
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
        const value = this.clientXToValue(event.clientX);
        const handle = this.resolveDragHandleForValue(value);
        this.dragHandle = handle;
        this.syncDraggingHandle();
        this.setHandleValue(handle, value);
    }

    /**
     * @returns {void}
     */
    stopDragging() {
        this.clearDraggingHandle();
        this.dragHandle = null;
        this.dragStartedCollapsed = false;
        document.removeEventListener("pointermove", this.boundPointerMove, true);
        document.removeEventListener("pointerup", this.boundPointerUp, true);
    }

    /**
     * @returns {void}
     */
    syncDraggingHandle() {
        this.minHandleElement.classList.toggle(SETTINGS_RANGE_HANDLE_DRAGGING_CLASS, this.dragHandle === "min");
        this.maxHandleElement.classList.toggle(SETTINGS_RANGE_HANDLE_DRAGGING_CLASS, this.dragHandle === "max");
    }

    /**
     * @returns {void}
     */
    clearDraggingHandle() {
        this.minHandleElement.classList.remove(SETTINGS_RANGE_HANDLE_DRAGGING_CLASS);
        this.maxHandleElement.classList.remove(SETTINGS_RANGE_HANDLE_DRAGGING_CLASS);
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
     * @param {number} value
     * @returns {"min" | "max"}
     */
    resolveDragHandleForValue(value) {
        if (!this.dragHandle) {
            return "min";
        }

        if (!this.dragStartedCollapsed) {
            return this.dragHandle;
        }

        const currentValue = this.getNormalizedValue();

        if (value < currentValue.min) {
            return "min";
        }

        if (value > currentValue.max) {
            return "max";
        }

        return this.dragHandle;
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
