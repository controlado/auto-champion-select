/**
 * @author Yan Gabriel <Balaclava#1912>
 */

export function getDropdown(dropdownId) {
    const dropdown = document.createElement("lol-uikit-framed-dropdown")
    dropdown.setAttribute("id", dropdownId)
    dropdown.style.setProperty("margin-bottom", "1.2px")
    return dropdown
}

export function getOption(text) {
    const option = document.createElement("lol-uikit-dropdown-option")
    option.setAttribute("slot", "lol-uikit-dropdown-option")
    option.innerHTML = text
    return option
}

export function getPlaceholderOption(text) {
    const placeholderOption = getOption(text)
    placeholderOption.setAttribute("clickable", "false")
    return placeholderOption
}

export function getCheckBox(text, enabled) {
    const pickCheckbox = document.createElement("lol-uikit-radio-input-option")
    pickCheckbox.setAttribute("selected", enabled)
    pickCheckbox.style.setProperty("margin-left", "16px")
    pickCheckbox.style.fontFamily = "Arial"
    pickCheckbox.innerHTML = text
    return pickCheckbox
}
