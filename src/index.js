import { request, sleep, linkEndpoint } from "https://cdn.skypack.dev/balaclava-utils@latest";
import { ChampionSelect, Dropdown, Checkbox, SocialSection } from "./models.js";
import "./assets/style.css";

/**
 * @author balaclava
 * @name auto-champion-select
 * @link https://github.com/controlado/auto-champion-select
 * @description Pick or ban automatically! 🐧
 */

async function getPlayableChampions() {
    let response = await request("GET", "/lol-champions/v1/owned-champions-minimal");

    while (!response.ok) {
        console.debug("auto-champion-select(owned-champions-minimal): retrying...");
        response = await request("GET", "/lol-champions/v1/owned-champions-minimal");
        await sleep(1000); // /lol-champions/v1/owned-champions-minimal returns 404 at startup
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

function getSocialContainer() {
    return document.querySelector("lol-social-roster.roster");
}

const championSelect = new ChampionSelect();

const pickCheckbox = new Checkbox("Pick", "controladoPick");
const firstPlayableChampionsDropdown = new Dropdown("1st pick", "controladoPick", 0, getPlayableChampions);
const secondPlayableChampionsDropdown = new Dropdown("2st pick", "controladoPick", 1, getPlayableChampions);

const banCheckbox = new Checkbox("Ban", "controladoBan");
const firstAllChampionsDropdown = new Dropdown("1st ban", "controladoBan", 0, getAllChampions);
const secondAllChampionsDropdown = new Dropdown("2st ban", "controladoBan", 1, getAllChampions);

window.addEventListener("load", async () => {
    let socialContainer = getSocialContainer();

    while (!socialContainer) {
        await sleep(200); // not available at startup
        socialContainer = getSocialContainer();
    }

    Promise.all([
        pickCheckbox.setup(),
        banCheckbox.setup(),
        firstPlayableChampionsDropdown.setup(),
        secondPlayableChampionsDropdown.setup(),
        firstAllChampionsDropdown.setup(),
        secondAllChampionsDropdown.setup()
    ]);

    linkEndpoint("/lol-inventory/v1/wallet", parsedEvent => {
        if (parsedEvent.eventType === "Update") {
            firstPlayableChampionsDropdown.refresh();
            secondPlayableChampionsDropdown.refresh();
        }
    });

    linkEndpoint("/lol-gameflow/v1/gameflow-phase", parsedEvent => {
        if (parsedEvent.data === "ChampSelect") { championSelect.mount(); }
        else { championSelect.unmount(); }
    });

    const dropdownsContainer = document.createElement("div");
    const checkboxesContainer = document.createElement("div");
    checkboxesContainer.classList.add("auto-select-checkboxes-div");

    checkboxesContainer.append(pickCheckbox.element, banCheckbox.element);
    dropdownsContainer.append(firstPlayableChampionsDropdown.element, secondPlayableChampionsDropdown.element);
    dropdownsContainer.append(firstAllChampionsDropdown.element, secondAllChampionsDropdown.element);

    const pluginSection = new SocialSection("Auto champion select", dropdownsContainer, checkboxesContainer);
    socialContainer.append(pluginSection.element, checkboxesContainer, dropdownsContainer);
    console.debug("auto-champion-select: Report bugs to Balaclava#1912");
});