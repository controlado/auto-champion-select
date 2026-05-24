import { request, sleep, linkEndpoint } from "https://cdn.jsdelivr.net/npm/balaclava-utils@latest";
import { version } from "../package.json";
import { patchConfig, readConfig } from "./config-store.js";
import { getPlayableChampions, getAllChampions } from "./champion-data.js";
import { ChampionSelect } from "./champion-select.js";
import { ChampionPrioritySelector } from "./champion-priority-selector.js";
import { ChampSelectControlsMenu, ConfigToggle, SettingsCheckbox, SettingsMenu, SocialRosterSection } from "./ui.js";
import { AutoPickSwitchAction, AutoBanSwitchAction, ForcePickSwitchAction, ForceBanSwitchAction, RefreshDropdownsAction, addActions } from "./actions.js";
import { LEAGUE_CLIENT_ENDPOINTS } from "./league-client-endpoints.js";
import { getChampSelectButtonsContainer, getSocialRosterContainer } from "./league-client-dom.js";
import { showErrorToast, showSuccessToast } from "./toast.js";
import "./assets/style.css";

/**
 * @typedef {"ReadyCheck" | "ChampSelect" | string | null} GameflowPhase
 *
 * @typedef {Object} LeagueEndpointEvent
 * @property {unknown} data
 * @property {string} [eventType]
 *
 * @typedef {Object} GameflowPhaseEvent
 * @property {GameflowPhase} data
 *
 * @typedef {Object} SharedControls
 * @property {ChampionSelect} championSelect
 * @property {ConfigToggle} autoAcceptToggle
 * @property {ConfigToggle} pickToggle
 * @property {ConfigToggle} banToggle
 * @property {ChampionPrioritySelector} pickChampionSelector
 * @property {ChampionPrioritySelector} banChampionSelector
 * @property {HTMLDivElement} selectorsContainer
 * @property {HTMLDivElement} checkboxesContainer
 * @property {SocialRosterSection} pluginSection
 * @property {SettingsMenu} settingsMenu
 * @property {ChampionPrioritySelector[]} championSelectors
 *
 * @typedef {Object} PluginRuntime
 * @property {ChampionSelect} championSelect
 * @property {ConfigToggle} autoAcceptToggle
 * @property {ConfigToggle} pickToggle
 * @property {ConfigToggle} banToggle
 * @property {ReadyCheckModalSuppressor} readyCheckModalSuppressor
 * @property {ChampionPrioritySelector} pickChampionSelector
 * @property {ChampionPrioritySelector} banChampionSelector
 * @property {HTMLDivElement} selectorsContainer
 * @property {HTMLDivElement} checkboxesContainer
 * @property {SocialRosterSection} pluginSection
 * @property {SettingsMenu} settingsMenu
 * @property {ChampionPrioritySelector[]} championSelectors
 * @property {ChampSelectControlsMenu} champSelectControlsMenu
 * @property {() => void} setupToggles
 * @property {() => void} setupSettingsMenu
 * @property {() => Promise<void>} setupChampionSelectors
 * @property {() => Promise<void>} refreshChampionSelectors
 * @property {() => Promise<void>} refreshPickChampionSelector
 * @property {(phase: GameflowPhase) => Promise<void>} handleGameflowPhase
 *
 * @typedef {Object} ControlsPlacementManager
 * @property {(callback: () => boolean) => void} setIsChampSelectControlsMounted
 * @property {() => Promise<void>} returnControlsToSocialRoster
 */

/**
 * @author balaclava
 * @name auto-champion-select
 * @link https://github.com/controlado/auto-champion-select
 * @description Pick or ban automatically! 🐧
 */

const SOCIAL_ROSTER_RETRY_DELAY_MS = 200;
const CHAMP_SELECT_RECOVERY_OBSERVER_TIMEOUT_MS = 60000;

const READY_CHECK_ACCEPT_DELAY_MS = 2000;
const READY_CHECK_ROOT_SELECTOR = ".ready-check-root-element";
const READY_CHECK_MODAL_SELECTOR = "#lol-uikit-layer-manager-wrapper > .modal";
const READY_CHECK_ACCEPT_SUCCESS_TOAST = "Accepted ready check!";
const READY_CHECK_ACCEPT_ERROR_TOAST = "Failed to accept ready check. Check console.";

const PLUGIN_CHAMP_SELECT_MENU_HEADER_SELECTOR = ".auto-select-champ-select-menu__header";

const CONFIG_KEYS = Object.freeze({
    autoAccept: "controladoAutoAccept",
    pick: "controladoPick",
    ban: "controladoBan"
});

/**
 * @returns {boolean}
 */
function isAutoAcceptEnabled() {
    return readConfig(CONFIG_KEYS.autoAccept).enabled === true;
}

/**
 * @param {"pick" | "ban"} action
 * @returns {"controladoPick" | "controladoBan"}
 */
function getConfigKeyForDraftAction(action) {
    return action === "pick" ? CONFIG_KEYS.pick : CONFIG_KEYS.ban;
}

/**
 * @param {"pick" | "ban"} action
 * @returns {boolean}
 */
function isQuickActionEnabled(action) {
    return readConfig(getConfigKeyForDraftAction(action)).quickAction === true;
}

/**
 * @param {"pick" | "ban"} action
 * @returns {void}
 */
function toggleQuickAction(action) {
    patchConfig(getConfigKeyForDraftAction(action), config => {
        config.quickAction = config.quickAction !== true;
        return config;
    });
}

class ReadyCheckModalSuppressor {
    /**
     * @param {() => boolean} isEnabled
     */
    constructor(isEnabled) {
        this.isEnabled = isEnabled;
        this.observer = null;
        this.hiddenModal = null;
        this.hiddenModalStyles = new WeakMap();

        this.sync = this.sync.bind(this);
    }

    /**
     * @returns {void}
     */
    start() {
        if (this.observer) {
            return;
        }

        this.observer = new MutationObserver(() => this.sync());
        this.observer.observe(document.body, { childList: true, subtree: true });
        this.sync();
    }

    /**
     * @returns {void}
     */
    sync() {
        const readyCheckModal = getReadyCheckModal();
        if (!readyCheckModal) {
            this.restore();
            return;
        }

        if (!this.isEnabled()) {
            this.restore();
            return;
        }

        this.hide(readyCheckModal);
    }

    /**
     * @param {HTMLElement} modal
     * @returns {void}
     */
    hide(modal) {
        if (this.hiddenModal === modal) {
            return;
        }

        this.restore();

        this.hiddenModal = modal;
        this.hiddenModalStyles.set(modal, {
            display: modal.style.getPropertyValue("display"),
            displayPriority: modal.style.getPropertyPriority("display"),
            pointerEvents: modal.style.getPropertyValue("pointer-events"),
            pointerEventsPriority: modal.style.getPropertyPriority("pointer-events")
        });

        modal.style.setProperty("display", "none", "important");
        modal.style.setProperty("pointer-events", "none", "important");
    }

    /**
     * @returns {void}
     */
    restore() {
        if (!this.hiddenModal) {
            return;
        }

        const modal = this.hiddenModal;
        const styles = this.hiddenModalStyles.get(modal);

        restoreStyleProperty(modal, "display", styles?.display, styles?.displayPriority);
        restoreStyleProperty(modal, "pointer-events", styles?.pointerEvents, styles?.pointerEventsPriority);

        this.hiddenModalStyles.delete(modal);
        this.hiddenModal = null;
    }
}

/**
 * @returns {HTMLElement | null}
 */
function getReadyCheckModal() {
    const readyCheckRoot = document.querySelector(READY_CHECK_ROOT_SELECTOR);
    return readyCheckRoot?.closest(READY_CHECK_MODAL_SELECTOR) || null;
}

/**
 * @param {HTMLElement} element
 * @param {string} property
 * @param {string | undefined} value
 * @param {string | undefined} priority
 * @returns {void}
 */
function restoreStyleProperty(element, property, value, priority) {
    if (value) {
        element.style.setProperty(property, value, priority || "");
    } else {
        element.style.removeProperty(property);
    }
}

/**
 * @param {ReadyCheckModalSuppressor} readyCheckModalSuppressor
 * @returns {Promise<void>}
 */
async function onReadyCheck(readyCheckModalSuppressor) {
    function restoreIfAutoAcceptDisabled() {
        if (isAutoAcceptEnabled()) {
            return false;
        }

        readyCheckModalSuppressor.restore();
        return true;
    }

    if (restoreIfAutoAcceptDisabled()) {
        return;
    }

    console.debug(`auto-champion-select(auto-accept): Ready check detected, accepting in ${READY_CHECK_ACCEPT_DELAY_MS}ms...`);
    await sleep(READY_CHECK_ACCEPT_DELAY_MS);

    if (restoreIfAutoAcceptDisabled()) {
        return;
    }

    let accepted = false;
    try {
        accepted = await autoAccept();
    } catch (error) {
        readyCheckModalSuppressor.restore();
        showErrorToast(READY_CHECK_ACCEPT_ERROR_TOAST);
        throw error;
    }

    if (accepted) {
        showSuccessToast(READY_CHECK_ACCEPT_SUCCESS_TOAST);
    } else {
        readyCheckModalSuppressor.restore();
        showErrorToast(READY_CHECK_ACCEPT_ERROR_TOAST);
    }
}

/**
 * @returns {Promise<boolean>}
 */
async function autoAccept() {
    const response = await request("POST", LEAGUE_CLIENT_ENDPOINTS.readyCheckAccept);
    if (response.ok) {
        console.debug("auto-champion-select(auto-accept): Accepted ready check");
        return true;
    } else {
        console.error("auto-champion-select(auto-accept): Failed to accept ready check", response);
        return false;
    }
}

/**
 * @param {PluginRuntime} runtime
 * @returns {Promise<void>}
 */
async function syncInitialGameflowPhase(runtime) {
    const response = await request("GET", LEAGUE_CLIENT_ENDPOINTS.gameflowPhase);
    const phase = response.ok ? await response.json() : null;
    void runtime.handleGameflowPhase(phase);
}

/**
 * @param {{championSelect: ChampionSelect, champSelectControlsMenu: ChampSelectControlsMenu, readyCheckModalSuppressor: ReadyCheckModalSuppressor, setupChampionSelectors: () => Promise<void>}} runtime
 * @returns {(phase: GameflowPhase) => Promise<void>}
 */
function createGameflowPhaseHandler({ championSelect, champSelectControlsMenu, readyCheckModalSuppressor, setupChampionSelectors }) {
    let gameflowPhaseVersion = 0;

    return async function handleGameflowPhase(phase) {
        const phaseVersion = ++gameflowPhaseVersion;
        try {
            await onGameflowPhase(phase, phaseVersion);
        } catch (error) {
            console.error("auto-champion-select: Failed to handle gameflow phase", error);
        }
    };

    /**
     * @param {GameflowPhase} phase
     * @param {number} phaseVersion
     * @returns {Promise<void>}
     */
    async function onGameflowPhase(phase, phaseVersion) {
        if (phase === "ReadyCheck") {
            void onReadyCheck(readyCheckModalSuppressor).catch(error => {
                console.error("auto-champion-select(auto-accept): Failed to handle ready check", error);
            });
        } else {
            readyCheckModalSuppressor.restore();
        }

        await mountControlsForPhase(phase);

        if (phaseVersion === gameflowPhaseVersion) {
            await setupChampionSelectors();
        }
    }

    /**
     * @param {GameflowPhase} phase
     * @returns {Promise<void>}
     */
    async function mountControlsForPhase(phase) {
        if (phase === "ChampSelect") {
            championSelect.mount();
            await champSelectControlsMenu.mount();
        } else {
            championSelect.unmount();
            await champSelectControlsMenu.unmount();
        }
    }
}

/**
 * @returns {SharedControls}
 */
function createSharedControls() {
    const championSelect = new ChampionSelect();

    const autoAcceptToggle = new ConfigToggle("Accept", CONFIG_KEYS.autoAccept);
    const pickToggle = new ConfigToggle("Pick", CONFIG_KEYS.pick);
    const pickChampionSelector = new ChampionPrioritySelector(
        "Add pick",
        CONFIG_KEYS.pick,
        getPlayableChampions,
        {
            enablePositionRestrictions: true,
            enableRandomAssignedPositionRestrictions: true,
            enableBraveryOption: true,
            quickActionLabel: "Pick instantly",
            enableRandomPoolPositionFilters: true,
        }
    );

    const banToggle = new ConfigToggle("Ban", CONFIG_KEYS.ban);
    const banChampionSelector = new ChampionPrioritySelector(
        "Add ban",
        CONFIG_KEYS.ban,
        getAllChampions,
        {
            quickActionLabel: "Ban instantly",
            enableRandomPoolPositionFilters: true,
        }
    );

    const selectorsContainer = createSelectorsContainer(pickChampionSelector, banChampionSelector);
    const checkboxesContainer = createCheckboxesContainer(autoAcceptToggle, pickToggle, banToggle);
    const settingsMenu = createSettingsMenu();

    const pluginSection = new SocialRosterSection("Auto champion select", selectorsContainer, checkboxesContainer);
    pluginSection.setHeaderAccessory(settingsMenu.createTriggerElement());
    const championSelectors = [pickChampionSelector, banChampionSelector];

    return {
        championSelect,
        autoAcceptToggle,
        pickToggle,
        banToggle,
        pickChampionSelector,
        banChampionSelector,
        selectorsContainer,
        checkboxesContainer,
        pluginSection,
        settingsMenu,
        championSelectors
    };
}

/**
 * @returns {SettingsMenu}
 */
function createSettingsMenu() {
    return new SettingsMenu([
        new SettingsCheckbox("Fast pick", {
            isSelected: () => isQuickActionEnabled("pick"),
            toggle: () => toggleQuickAction("pick")
        }),
        new SettingsCheckbox("Fast ban", {
            isSelected: () => isQuickActionEnabled("ban"),
            toggle: () => toggleQuickAction("ban")
        })
    ]);
}

/**
 * @param {...ChampionPrioritySelector} selectors
 * @returns {HTMLDivElement}
 */
function createSelectorsContainer(...selectors) {
    const container = document.createElement("div");
    container.append(...selectors.map(selector => selector.element));
    return container;
}

/**
 * @param {...ConfigToggle} toggles
 * @returns {HTMLDivElement}
 */
function createCheckboxesContainer(...toggles) {
    const container = document.createElement("div");
    container.classList.add("auto-select-checkboxes-div");
    container.append(...toggles.map(toggle => toggle.element));
    return container;
}

/**
 * @param {{pluginSection: SocialRosterSection, checkboxesContainer: HTMLDivElement, selectorsContainer: HTMLDivElement}} controls
 * @returns {ControlsPlacementManager}
 */
function createControlsPlacementManager({ pluginSection, checkboxesContainer, selectorsContainer }) {
    let returnControlsTask = null;
    let controlsPlacementVersion = 0;
    let isChampSelectControlsMounted = () => false;

    /**
     * @param {number} version
     * @returns {Promise<void>}
     */
    async function appendControlsToSocialRoster(version) {
        let socialContainer = getSocialRosterContainer();

        while (!socialContainer) {
            if (isChampSelectControlsMounted() || version !== controlsPlacementVersion) {
                return;
            }

            await sleep(SOCIAL_ROSTER_RETRY_DELAY_MS); // not available during startup or champion select reloads
            socialContainer = getSocialRosterContainer();
        }

        if (isChampSelectControlsMounted() || version !== controlsPlacementVersion) {
            return;
        }

        socialContainer.append(pluginSection.element, checkboxesContainer, selectorsContainer);
    }

    return {
        setIsChampSelectControlsMounted(callback) {
            isChampSelectControlsMounted = callback;
        },

        returnControlsToSocialRoster() {
            if (returnControlsTask) {
                return returnControlsTask;
            }

            const version = ++controlsPlacementVersion;
            returnControlsTask = appendControlsToSocialRoster(version)
                .catch(error => console.error("auto-champion-select: Failed to return controls to social roster", error))
                .finally(() => {
                    returnControlsTask = null;
                });

            return returnControlsTask;
        }
    };
}

/**
 * @param {{autoAcceptToggle: ConfigToggle, pickToggle: ConfigToggle, banToggle: ConfigToggle, readyCheckModalSuppressor: ReadyCheckModalSuppressor}} controls
 * @returns {void}
 */
function setupConfigToggles({ autoAcceptToggle, pickToggle, banToggle, readyCheckModalSuppressor }) {
    autoAcceptToggle.setup();
    autoAcceptToggle.element.addEventListener("click", () => readyCheckModalSuppressor.sync());
    pickToggle.setup();
    banToggle.setup();
}

/**
 * @param {ChampionPrioritySelector[]} championSelectors
 * @returns {Promise<void>}
 */
async function setupChampionSelectors(championSelectors) {
    await Promise.all(championSelectors.map(selector => selector.setup()));
}

/**
 * @param {ChampionPrioritySelector[]} championSelectors
 * @returns {Promise<void>}
 */
async function refreshChampionSelectors(championSelectors) {
    await Promise.all(championSelectors.map(selector => selector.refresh()));
}

/**
 * @returns {PluginRuntime}
 */
function createPluginRuntime() {
    const controls = createSharedControls();
    const readyCheckModalSuppressor = new ReadyCheckModalSuppressor(isAutoAcceptEnabled);
    const controlsPlacementManager = createControlsPlacementManager(controls);
    const champSelectControlsMenu = new ChampSelectControlsMenu(
        "Auto Champion Select",
        controlsPlacementManager.returnControlsToSocialRoster,
        [controls.checkboxesContainer, controls.selectorsContainer]
    );
    champSelectControlsMenu.setTitleAccessory(controls.settingsMenu.createTriggerElement());
    controlsPlacementManager.setIsChampSelectControlsMounted(() => champSelectControlsMenu.mounted);

    const runtime = {
        ...controls,
        champSelectControlsMenu,
        readyCheckModalSuppressor,
        setupToggles: () => setupConfigToggles({ ...controls, readyCheckModalSuppressor }),
        setupSettingsMenu: () => controls.settingsMenu.setup(),
        setupChampionSelectors: () => setupChampionSelectors(controls.championSelectors),
        refreshChampionSelectors: () => refreshChampionSelectors(controls.championSelectors),
        refreshPickChampionSelector: async () => {
            await controls.pickChampionSelector.refresh();
        }
    };

    runtime.handleGameflowPhase = createGameflowPhaseHandler(runtime);
    return runtime;
}

/**
 * @param {PluginRuntime} runtime
 * @returns {void}
 */
function registerLeagueClientSubscriptions(runtime) {
    linkEndpoint(LEAGUE_CLIENT_ENDPOINTS.gameflowPhase, /** @param {GameflowPhaseEvent} parsedEvent */ parsedEvent => {
        runtime.handleGameflowPhase(parsedEvent.data);
    });

    linkEndpoint(LEAGUE_CLIENT_ENDPOINTS.wallet, /** @param {LeagueEndpointEvent} parsedEvent */ async parsedEvent => {
        if (parsedEvent.eventType === "Update") {
            console.debug("auto-champion-select(wallet): Refreshing champion selectors...");
            try {
                await runtime.refreshPickChampionSelector();
            } catch (error) {
                console.error("auto-champion-select(wallet): Failed to refresh champion selectors", error);
            }
        }
    });
}

/**
 * @param {{pickToggle: ConfigToggle, banToggle: ConfigToggle, refreshChampionSelectors: () => Promise<void>}} runtime
 * @returns {void}
 */
function registerCommandActions({ pickToggle, banToggle, refreshChampionSelectors }) {
    addActions([
        new AutoPickSwitchAction(() => pickToggle.toggle()),
        new AutoBanSwitchAction(() => banToggle.toggle()),
        new ForcePickSwitchAction(),
        new ForceBanSwitchAction(),
        new RefreshDropdownsAction(refreshChampionSelectors)
    ]);
}

/**
 * @param {PluginRuntime} runtime
 * @returns {void}
 */
function observeInitialChampSelectRecovery(runtime) {
    let syncFrame = null;
    let observer = null;

    function stopObservingChampionSelectView() {
        observer?.disconnect();
        observer = null;

        if (syncFrame !== null) {
            cancelAnimationFrame(syncFrame);
            syncFrame = null;
        }
    }

    const observerTimeoutId = setTimeout(() => {
        stopObservingChampionSelectView();
    }, CHAMP_SELECT_RECOVERY_OBSERVER_TIMEOUT_MS);

    function reconcileChampionSelectView() {
        const hasChampionSelectButtons = getChampSelectButtonsContainer() !== null;
        if (!hasChampionSelectButtons) {
            return;
        }

        clearTimeout(observerTimeoutId);
        stopObservingChampionSelectView();

        const hasPluginButton = document.querySelector(PLUGIN_CHAMP_SELECT_MENU_HEADER_SELECTOR) !== null;
        if (!hasPluginButton) {
            runtime.handleGameflowPhase("ChampSelect");
        }
    }

    observer = new MutationObserver(() => {
        if (syncFrame !== null) {
            return;
        }

        syncFrame = requestAnimationFrame(() => {
            syncFrame = null;
            reconcileChampionSelectView();
        });
    });

    observer.observe(document.body, { childList: true, subtree: true });
    reconcileChampionSelectView();
}

/**
 * @returns {Promise<void>}
 */
async function main() {
    const runtime = createPluginRuntime();

    runtime.setupToggles();
    runtime.setupSettingsMenu();
    runtime.readyCheckModalSuppressor.start();

    registerCommandActions(runtime);
    registerLeagueClientSubscriptions(runtime);

    await syncInitialGameflowPhase(runtime);
    observeInitialChampSelectRecovery(runtime);

    console.debug(`auto-champion-select(${version}): Report bugs to Balaclava#1912`);
}

let initialized = false;

/**
 * Pengu Loader entrypoint.
 *
 * @returns {void}
 */
export function load() {
    if (initialized) {
        return;
    }

    initialized = true;
    main().catch(error => console.error("auto-champion-select: Failed to initialize", error));
}

// support both Pengu's exported load entrypoint and
// direct import-only installs; initialized prevents
// double startup.
if (document.readyState === "loading") {
    window.addEventListener("load", load, { once: true });
} else {
    load();
}
