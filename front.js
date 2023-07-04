/**
 * @author balaclava
 * @name auto-champion-select
 * @link https://github.com/controlado/auto-champion-select
 * @description Pick or ban automatically! 🐧
 */

export function getDropdown(dropdownId) {
  const dropdown = document.createElement("lol-uikit-framed-dropdown");
  dropdown.setAttribute("style", "margin-bottom: 1.2px;");
  dropdown.id = dropdownId;
  return dropdown;
}

export function getOption(text) {
  const option = document.createElement("lol-uikit-dropdown-option");
  option.setAttribute("slot", "lol-uikit-dropdown-option");
  option.textContent = text;
  return option;
}

export function getCheckBox(text, enabled) {
  const pickCheckbox = document.createElement("lol-uikit-radio-input-option");
  if (enabled) { pickCheckbox.setAttribute("selected", "true"); }
  pickCheckbox.setAttribute("style", "margin-left: 16px; font-family: Arial;");
  pickCheckbox.textContent = text;
  return pickCheckbox;
}
