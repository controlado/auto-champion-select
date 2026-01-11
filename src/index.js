import { request, sleep, linkEndpoint } from "https://cdn.jsdelivr.net/npm/balaclava-utils@latest";
import { ChampionSelect, Dropdown, Checkbox, SocialSection } from "./models.js";
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

async function getPlayableChampions() {
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

async function getAllChampions() {
    const response = await request("GET", "/lol-game-data/assets/v1/champion-summary.json");
    const responseData = await response.json();
    responseData.sort((a, b) => a.name.localeCompare(b.name));
    return responseData;
}

async function onReadyCheck() {
    if (autoAcceptCheckbox.config.enabled === true) {
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

window.addEventListener("load", async () => {
    let socialContainer = getSocialContainer();

    while (!socialContainer) {
        await sleep(200); // not available at startup
        socialContainer = getSocialContainer();
    }

    Promise.all([
        autoAcceptCheckbox.setup(),
        pickCheckbox.setup(),
        banCheckbox.setup(),
        firstPlayableChampionsDropdown.setup(),
        secondPlayableChampionsDropdown.setup(),
        firstAllChampionsDropdown.setup(),
        secondAllChampionsDropdown.setup()
    ]);

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

    linkEndpoint("/lol-inventory/v1/wallet", parsedEvent => {
        if (parsedEvent.eventType === "Update") {
            console.debug("auto-champion-select(wallet): Refreshing dropdowns...");
            Promise.all([
                firstPlayableChampionsDropdown.refresh(),
                secondPlayableChampionsDropdown.refresh(),
            ]);
        }
    });

    linkEndpoint("/lol-gameflow/v1/gameflow-phase", parsedEvent => {
        if (parsedEvent.data === "ReadyCheck") { onReadyCheck(); }
        if (parsedEvent.data === "ChampSelect") { championSelect.mount(); }
        else { championSelect.unmount(); }
    });

    const dropdownsContainer = document.createElement("div");
    const checkboxesContainer = document.createElement("div");
    checkboxesContainer.classList.add("auto-select-checkboxes-div");

    checkboxesContainer.append(autoAcceptCheckbox.element, pickCheckbox.element, banCheckbox.element);
    dropdownsContainer.append(firstPlayableChampionsDropdown.element, secondPlayableChampionsDropdown.element);
    dropdownsContainer.append(firstAllChampionsDropdown.element, secondAllChampionsDropdown.element);

    const pluginSection = new SocialSection("Auto champion select", dropdownsContainer, checkboxesContainer);
    socialContainer.append(pluginSection.element, checkboxesContainer, dropdownsContainer);

    console.debug(`auto-champion-select(${version}): Report bugs to Balaclava#1912`);
});