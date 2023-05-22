/**
 * @author
 * Nome: Yan Gabriel    
 * Discord: Balaclava#1912 (854886148455399436)    
 * GitHub: https://github.com/controlado
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

export function getCheckBox(text, enabled) {
    const pickCheckbox = document.createElement("lol-uikit-radio-input-option")
    if (enabled) { pickCheckbox.setAttribute("selected", enabled) }
    pickCheckbox.style.setProperty("margin-left", "16px")
    pickCheckbox.style.fontFamily = "Arial"
    pickCheckbox.innerHTML = text
    return pickCheckbox
}
