import { request, sleep, linkEndpoint } from "https://cdn.jsdelivr.net/npm/balaclava-utils@latest";
import { version } from "../package.json";
import { readConfig } from "./config-store.js";
import { getPlayableChampions, getAllChampions } from "./champion-data.js";
import { ChampionSelect } from "./champion-select.js";
import { ChampionPrioritySelector } from "./champion-priority-selector.js";
import { ChampSelectControlsMenu, ConfigToggle, SocialRosterSection } from "./ui.js";
import { AutoPickSwitchAction, AutoBanSwitchAction, ForcePickSwitchAction, ForceBanSwitchAction, RefreshDropdownsAction, addActions } from "./actions.js";
import { LEAGUE_CLIENT_ENDPOINTS } from "./league-client-endpoints.js";
import { getChampSelectButtonsContainer, getSocialRosterContainer } from "./league-client-dom.js";
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
 * @property {ChampionPrioritySelector[]} championSelectors
 *
 * @typedef {Object} PluginRuntime
 * @property {ChampionSelect} championSelect
 * @property {ConfigToggle} autoAcceptToggle
 * @property {ConfigToggle} pickToggle
 * @property {ConfigToggle} banToggle
 * @property {ChampionPrioritySelector} pickChampionSelector
 * @property {ChampionPrioritySelector} banChampionSelector
 * @property {HTMLDivElement} selectorsContainer
 * @property {HTMLDivElement} checkboxesContainer
 * @property {SocialRosterSection} pluginSection
 * @property {ChampionPrioritySelector[]} championSelectors
 * @property {ChampSelectControlsMenu} champSelectControlsMenu
 * @property {() => void} setupToggles
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

const READY_CHECK_ACCEPT_DELAY_MS = 2000;
const SOCIAL_ROSTER_RETRY_DELAY_MS = 200;
const CHAMP_SELECT_RECOVERY_OBSERVER_TIMEOUT_MS = 60000;

const PLUGIN_CHAMP_SELECT_MENU_HEADER_SELECTOR = ".auto-select-champ-select-menu__header";

const CONFIG_KEYS = Object.freeze({
    autoAccept: "controladoAutoAccept",
    pick: "controladoPick",
    ban: "controladoBan"
});

async function onReadyCheck() {
    if (readConfig(CONFIG_KEYS.autoAccept).enabled === true) {
        console.debug("auto-champion-select(auto-accept): Ready check detected, accepting in 2 seconds...");
        await sleep(READY_CHECK_ACCEPT_DELAY_MS);
        await autoAccept();
    }
}

async function autoAccept() {
    const response = await request("POST", LEAGUE_CLIENT_ENDPOINTS.readyCheckAccept);
    if (response.ok) {
        console.debug("auto-champion-select(auto-accept): Accepted ready check");
    } else {
        console.error("auto-champion-select(auto-accept): Failed to accept ready check", response);
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
 * @param {{championSelect: ChampionSelect, champSelectControlsMenu: ChampSelectControlsMenu, setupChampionSelectors: () => Promise<void>}} runtime
 * @returns {(phase: GameflowPhase) => Promise<void>}
 */
function createGameflowPhaseHandler({ championSelect, champSelectControlsMenu, setupChampionSelectors }) {
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
            void onReadyCheck().catch(error => console.error("auto-champion-select(auto-accept): Failed to handle ready check", error));
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
        { enablePositionRestrictions: true }
    );

    const banToggle = new ConfigToggle("Ban", CONFIG_KEYS.ban);
    const banChampionSelector = new ChampionPrioritySelector(
        "Add ban",
        CONFIG_KEYS.ban,
        getAllChampions
    );

    const selectorsContainer = createSelectorsContainer(pickChampionSelector, banChampionSelector);
    const checkboxesContainer = createCheckboxesContainer(autoAcceptToggle, pickToggle, banToggle);

    const pluginSection = new SocialRosterSection("Auto champion select", selectorsContainer, checkboxesContainer);
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
        championSelectors
    };
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
 * @param {{autoAcceptToggle: ConfigToggle, pickToggle: ConfigToggle, banToggle: ConfigToggle}} controls
 * @returns {void}
 */
function setupConfigToggles({ autoAcceptToggle, pickToggle, banToggle }) {
    autoAcceptToggle.setup();
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
    const controlsPlacementManager = createControlsPlacementManager(controls);
    const champSelectControlsMenu = new ChampSelectControlsMenu(
        "Auto Champion Select",
        controlsPlacementManager.returnControlsToSocialRoster,
        [controls.checkboxesContainer, controls.selectorsContainer]
    );
    controlsPlacementManager.setIsChampSelectControlsMounted(() => champSelectControlsMenu.mounted);

    const runtime = {
        ...controls,
        champSelectControlsMenu,
        setupToggles: () => setupConfigToggles(controls),
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
