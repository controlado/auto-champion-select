import { ensureConfig, patchConfig } from "./config-store.js";
import { LEAGUE_CLIENT_ELEMENTS } from "./league-client-dom.js";

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
