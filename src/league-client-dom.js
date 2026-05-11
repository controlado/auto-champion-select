export const LEAGUE_CLIENT_ELEMENTS = Object.freeze({
    dropdown: "lol-uikit-framed-dropdown",
    dropdownOption: "lol-uikit-dropdown-option",
    radioInputOption: "lol-uikit-radio-input-option",
    scrollable: "lol-uikit-scrollable",
    socialRosterGroup: "lol-social-roster-group"
});

export const LEAGUE_CLIENT_SELECTORS = Object.freeze({
    socialRoster: ".lol-social-roster",
    champSelectButtons: ".bottom-right-buttons",
    firstChampSelectSquareButton: "lol-social-chat-toggle-button, .missions-tracker-button-component, .champ-select-voice-button-wrapper",
    dropdownRoot: ".ui-dropdown",
    dropdownCurrent: ".ui-dropdown-current",
    dropdownCurrentContent: ".ui-dropdown-current-content",
    dropdownOption: LEAGUE_CLIENT_ELEMENTS.dropdownOption,
    dropdownOptionSelected: `${LEAGUE_CLIENT_ELEMENTS.dropdownOption}[selected]`,
    dropdownOptionsContainer: ".ui-dropdown-options-container",
    dropdownOptions: ".ui-dropdown-options",
    dropdownScrollable: LEAGUE_CLIENT_ELEMENTS.scrollable,
    socialRosterGroupArrow: ".arrow",
    socialRosterGroupHeader: ".group-header",
    socialRosterGroupLabel: "span"
});

/**
 * @returns {Element | null}
 */
export function getSocialRosterContainer() {
    return document.querySelector(LEAGUE_CLIENT_SELECTORS.socialRoster);
}

/**
 * @returns {Element | null}
 */
export function getChampSelectButtonsContainer() {
    return document.querySelector(LEAGUE_CLIENT_SELECTORS.champSelectButtons);
}
