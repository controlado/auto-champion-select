export class DropdownChampions {
    constructor(index, id, brightness = null) {
        this.index = index
        this.id = id
        this.element = front.getDropdown(this.id)
        this.element.style.filter = `brightness(${brightness})`
    }

    setup(champions) {
        for (const champion of champions) {
            const option = this.getOption(champion)
            this.element.append(option)
        }
    }

    getOption(champion) {
        const index = this.index
        const dropdownId = this.id
        const option = front.getOption(champion.name)
        option.addEventListener("click", function () { config[dropdownId]["ids"][index] = champion.id })
        if (config[dropdownId]["ids"][index] == champion.id) { option.setAttribute("selected", "true") }
        return option
    }
}

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

