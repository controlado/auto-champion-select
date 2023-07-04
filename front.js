/**
 * @name auto-champion-select
 * @author feminismo (balaclava)
 * @description Pick or ban automatically! 🐧
 * @link https://github.com/controlado/auto-champion-select
 */

export function getDropdown(dropdownId) {
    const dropdown = document.createElement("lol-uikit-framed-dropdown")
    dropdown.id = dropdownId
    dropdown.style.marginBottom = "1.2px"
    return dropdown
}

export function getOption(text) {
    const option = document.createElement("lol-uikit-dropdown-option")
    option.setAttribute("slot", "lol-uikit-dropdown-option")
    option.textContent = text
    return option
}

export function getCheckBox(text, enabled) {
    const pickCheckbox = document.createElement("lol-uikit-radio-input-option")
    if (enabled) { pickCheckbox.setAttribute("selected", enabled) }
    pickCheckbox.style.marginLeft = "16px"
    pickCheckbox.style.fontFamily = "Arial"
    pickCheckbox.textContent = text
    return pickCheckbox
}
