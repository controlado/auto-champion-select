import { request, sleep, linkEndpoint } from "https://cdn.jsdelivr.net/npm/balaclava-utils@latest";
import { ChampionSelect, ChampionSelectMenu, Dropdown, Checkbox, SocialSection } from "./models.js";
import { AutoPickSwitchAction, AutoBanSwitchAction, ForcePickSwitchAction, ForceBanSwitchAction, RefreshDropdownsAction, addActions } from "./actions.js";

import { version } from "../package.json";
import "./assets/style.css";

/**
 * @author balaclava
 * @name auto-champion-select
 * @link https://github.com/controlado/auto-champion-select
 * @description Pick or ban automatically! 🐧
 */

const championSelect = new ChampionSelect();

const autoAcceptCheckbox = new Checkbox("Accept", "controladoAutoAccept");

const pickCheckbox = new Checkbox("Pick", "controladoPick");
const firstPlayableChampionsDropdown = new Dropdown("1st pick", "controladoPick", 0, getPlayableChampions);
const secondPlayableChampionsDropdown = new Dropdown("2nd pick", "controladoPick", 1, getPlayableChampions);

const banCheckbox = new Checkbox("Ban", "controladoBan");
const firstAllChampionsDropdown = new Dropdown("1st ban", "controladoBan", 0, getAllChampions);
const secondAllChampionsDropdown = new Dropdown("2nd ban", "controladoBan", 1, getAllChampions);

function getSocialContainer() {
    return document.querySelector(".lol-social-roster");
}

let playableChampionsTask = null;
let allChampionsTask = null;

function getPlayableChampions() {
    if (!playableChampionsTask) {
        playableChampionsTask = fetchPlayableChampions()
            .finally(() => {
                playableChampionsTask = null;
            });
    }

    return playableChampionsTask;
}

async function fetchPlayableChampions() {
    let response = await request("GET", "/lol-champions/v1/owned-champions-minimal");

    while (!response.ok) {
        console.debug("auto-champion-select(owned-champions-minimal): Retrying...");
        response = await request("GET", "/lol-champions/v1/owned-champions-minimal");
        await sleep(1000); // endpoint /lol-champions/v1/owned-champions-minimal returns 404 at startup
    }

    const responseData = await response.json();
    responseData.sort((a, b) => a.name.localeCompare(b.name));
    return responseData;
}

function getAllChampions() {
    if (!allChampionsTask) {
        allChampionsTask = fetchAllChampions()
            .finally(() => {
                allChampionsTask = null;
            });
    }

    return allChampionsTask;
}

async function fetchAllChampions() {
    const response = await request("GET", "/lol-game-data/assets/v1/champion-summary.json");
    const responseData = await response.json();
    responseData.sort((a, b) => a.name.localeCompare(b.name));
    return responseData;
}

async function onReadyCheck() {
    if (autoAcceptCheckbox.config?.enabled === true) {
        console.debug("auto-champion-select(auto-accept): Ready check detected, accepting in 2 seconds...");
        await sleep(2000);
        await autoAccept();
    }
}

async function autoAccept() {
    const response = await request("POST", "/lol-matchmaking/v1/ready-check/accept");
    if (response.ok) {
        console.debug("auto-champion-select(auto-accept): Accepted ready check");
    } else {
        console.error("auto-champion-select(auto-accept): Failed to accept ready check", response);
    }
}

function createGameflowPhaseHandler({ championSelect, championSelectMenu, setupDropdowns }) {
    let gameflowPhaseVersion = 0;

    return function handleGameflowPhase(phase) {
        const version = ++gameflowPhaseVersion;

        onGameflowPhase(phase, version)
            .catch(error => console.error("auto-champion-select: Failed to handle gameflow phase", error));
    }

    async function onGameflowPhase(phase, version) {
        if (phase === "ReadyCheck") { onReadyCheck(); }

        await mountControlsForPhase(phase);

        if (version !== gameflowPhaseVersion) {
            return;
        }

        await setupDropdowns();
    }

    async function mountControlsForPhase(phase) {
        if (phase === "ChampSelect") {
            championSelect.mount();
            await championSelectMenu.mount();
        } else {
            championSelect.unmount();
            await championSelectMenu.unmount();
        }
    }
}

async function main() {
    const dropdownsContainer = document.createElement("div");
    const checkboxesContainer = document.createElement("div");
    checkboxesContainer.classList.add("auto-select-checkboxes-div");

    checkboxesContainer.append(autoAcceptCheckbox.element, pickCheckbox.element, banCheckbox.element);
    dropdownsContainer.append(firstPlayableChampionsDropdown.element, secondPlayableChampionsDropdown.element);
    dropdownsContainer.append(firstAllChampionsDropdown.element, secondAllChampionsDropdown.element);

    const pluginSection = new SocialSection("Auto champion select", dropdownsContainer, checkboxesContainer);
    const dropdowns = [
        firstPlayableChampionsDropdown,
        secondPlayableChampionsDropdown,
        firstAllChampionsDropdown,
        secondAllChampionsDropdown,
    ];

    let championSelectMenu;
    let restoreControlsTask = null;
    let restoreControlsVersion = 0;

    async function appendControlsToSocial(version) {
        let socialContainer = getSocialContainer();

        while (!socialContainer) {
            if (championSelectMenu.mounted || version !== restoreControlsVersion) {
                return;
            }

            await sleep(200); // not available during startup or champion select reloads
            socialContainer = getSocialContainer();
        }

        if (championSelectMenu.mounted || version !== restoreControlsVersion) {
            return;
        }

        socialContainer.append(pluginSection.element, checkboxesContainer, dropdownsContainer);
    }

    function restoreControls() {
        if (restoreControlsTask) {
            return restoreControlsTask;
        }

        const version = ++restoreControlsVersion;
        restoreControlsTask = appendControlsToSocial(version)
            .catch(error => console.error("auto-champion-select: Failed to restore controls", error))
            .finally(() => {
                restoreControlsTask = null;
            });

        return restoreControlsTask;
    }

    championSelectMenu = new ChampionSelectMenu(
        "Auto Champion Select",
        restoreControls,
        checkboxesContainer,
        dropdownsContainer,
    );

    autoAcceptCheckbox.setup();
    pickCheckbox.setup();
    banCheckbox.setup();

    const handleGameflowPhase = createGameflowPhaseHandler({
        championSelect,
        championSelectMenu,
        setupDropdowns,
    });

    linkEndpoint("/lol-gameflow/v1/gameflow-phase", parsedEvent => {
        handleGameflowPhase(parsedEvent.data);
    });

    const gameflowPhaseResponse = await request("GET", "/lol-gameflow/v1/gameflow-phase");
    if (gameflowPhaseResponse.ok) {
        handleGameflowPhase(await gameflowPhaseResponse.json());
    } else {
        handleGameflowPhase(null);
    }

    observeChampionSelectView();

    addActions([
        new AutoPickSwitchAction(() => pickCheckbox.toggle()),
        new AutoBanSwitchAction(() => banCheckbox.toggle()),
        new ForcePickSwitchAction(),
        new ForceBanSwitchAction(),
        new RefreshDropdownsAction([
            firstPlayableChampionsDropdown,
            secondPlayableChampionsDropdown,
        ]),
    ]);

    linkEndpoint("/lol-inventory/v1/wallet", async parsedEvent => {
        if (parsedEvent.eventType === "Update") {
            console.debug("auto-champion-select(wallet): Refreshing dropdowns...");
            await Promise.all([
                firstPlayableChampionsDropdown.refresh(),
                secondPlayableChampionsDropdown.refresh(),
            ]);
        }
    });

    console.debug(`auto-champion-select(${version}): Report bugs to Balaclava#1912`);

    function setupDropdowns() {
        return Promise.all(dropdowns.map(dropdown => dropdown.setup()));
    }

    function observeChampionSelectView() {
        const championSelectObserverTimeout = 60000;
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
        }, championSelectObserverTimeout);

        function reconcileChampionSelectView() {
            const hasChampionSelectButtons = document.querySelector(".bottom-right-buttons") !== null;
            if (!hasChampionSelectButtons) {
                return;
            }

            clearTimeout(observerTimeoutId);
            stopObservingChampionSelectView();

            const hasPluginButton = document.querySelector(".auto-select-champ-select-menu__header") !== null;
            if (!hasPluginButton) {
                handleGameflowPhase("ChampSelect");
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
}

let initialized = false;

export function load() {
    if (initialized) {
        return;
    }

    initialized = true;
    main().catch(error => console.error("auto-champion-select: Failed to initialize", error));
}

if (document.readyState === "loading") {
    window.addEventListener("load", load, { once: true });
} else {
    load();
}
