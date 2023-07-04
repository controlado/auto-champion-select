import { addRoutines, linkEndpoint, sleep } from "../controladoUtils"
import * as requests from "./requests"
import * as front from "./front"

/**
 * @name auto-champion-select
 * @author feminismo (balaclava)
 * @description Pick or ban automatically! 🐧
 * @link https://github.com/controlado/auto-champion-select
 */

export const plugin = {
  "name": "Auto Champion Select",
  "url": "https://github.com/controlado/auto-champion-select",
  "version": "1.0.1",
}
let allChampions = null // todos os campeões disponíveis no jogo
const defaultPickSettings = { "enabled": false, "champions": [429, 136] }
const defaultBanSettings = { "enabled": false, "force": false, "champions": [350, 221] }

const gamePhaseHandler = async message => {
  if (message.data.data !== "ChampSelect") { return }

  while (await requests.getGamePhase() === "ChampSelect") {
    const championSelectData = await requests.getChampionSelectData()
    await onChampionSelect(championSelectData)

    // sair do while caso `championSelectData.timer.phase` for finalization
    if (championSelectData.timer.phase === "FINALIZATION") { return }

    await sleep(200) // delay básico pra não sobrecarregar o lcu
  }
}

const onChampionSelect = async championSelectData => {
  const { localPlayerCellId, actions, bans, myTeam, theirTeam } = championSelectData
  const allBans = [...bans.myTeamBans, ...bans.theirTeamBans]
  const allPicks = [...myTeam, ...theirTeam]

  const pickChampion = DataStore.get("pickChampion")
  const banChampion = DataStore.get("banChampion")

  for (const subAction of actions) {
    for (const action of subAction) {
      // buscando apenas por ações do usuário local que não foram completadas
      if (action.completed || action.actorCellId != localPlayerCellId) { continue }

      if (action.type === "pick" && pickChampion.enabled) { // se é a vez de escolher um campeão
        for (const championId of pickChampion.champions) {
          if (allBans.some(bannedChampionId => bannedChampionId == championId)) { continue } // se alguém já baniu o campeão
          if (allPicks.some(player => player.championId == championId)) { continue } // se alguém já pegou o campeão
          if (await requests.selectChampion(action.id, championId)) { return }
        }
      }

      if (action.type === "ban" && banChampion.enabled) { // se é a vez de banir um campeão
        for (const championId of banChampion.champions) {
          if (allBans.some(bannedChampionId => bannedChampionId == championId)) { continue } // se alguém já baniu o campeão
          if (!banChampion.force && myTeam.some(ally => ally.championPickIntent == championId)) { continue }  // se o force tá desativado, se algum aliado quer o campeão
          if (await requests.selectChampion(action.id, championId)) { return } else { break }
        }
      }
    }
  }
}

class DropdownChampions {
  constructor(index, id, champions, tooltip, brightness = false) {
    this.index = index
    this.id = id
    this.champions = champions

    this.selectedChampion = null
    this.config = DataStore.get(this.id)
    this.element = front.getDropdown(this.id)

    for (const champion of this.champions) {
      const option = this.getOption(champion)
      this.element.append(option)
    }

    if (brightness) { this.element.style.filter = "brightness(0.7)" }
    this.hoverText = this.element.shadowRoot.querySelector("div > dt > div")
    this.element.onmouseenter = () => { this.hoverText.textContent = tooltip }
    this.element.onmouseleave = () => { this.hoverText.textContent = this.selectedChampion }
  }

  getOption(champion) {
    const option = front.getOption(champion.name)

    // callback da opção
    option.onclick = () => {
      this.config.champions[this.index] = champion.id
      this.selectedChampion = champion.name
      DataStore.set(this.id, this.config)
    }

    // verificando se já existe um campeão configurado
    if (this.config.champions[this.index] == champion.id) {
      this.selectedChampion = champion.name; option.setAttribute("selected", "true")
    }

    return option
  }
}

class DropdownChampionsContainer {
  constructor(id) {
    this.element = document.createElement("div")
    this.element.id = id

    // solução temporária pra bug de dropdown pra baixo
    // this.config = DataStore.get(configKey)
    // if (!this.config.enabled) {
    //  this.element.style.display = "none"
    // }
  }
}

class CheckboxContainer {
  constructor(id) {
    this.element = document.createElement("div")
    this.element.className = "alpha-version-panel"
    this.element.id = id
  }
}

class AutoCheckbox {
  constructor(text, configKey) {
    this.configKey = configKey
    this.config = DataStore.get(this.configKey)
    this.element = front.getCheckBox(text, this.config.enabled)

    this.element.onclick = () => { // resposta ao click do usuário ao checkbox
      this.config.enabled = !this.config.enabled
      DataStore.set(this.configKey, this.config)

      // ocultar container pai do elemento selecionado
      // const elementDropdown = document.getElementById(this.configKey)
      // elementDropdown.parentNode.style.display = "block"
      // elementDropdown.parentNode.style.display = "none"

      if (this.config.enabled) { this.element.setAttribute("selected", "true") }
      else { this.element.removeAttribute("selected") }
    }
  }
}

/**
 * Cria os elementos do plugin quando o container for modificado.
 */
const onMutation = () => {
  const socialContainer = document.querySelector(".lol-social-lower-pane-container")

  if ( // verificando se vale a pena criar os elementos
    !socialContainer || // se o container existe no documento
    document.getElementById("checkbox-container") || // container de checkboxes
    document.getElementById("pick-dropdown-container") || // container de dropdowns
    document.getElementById("ban-dropdown-container") // container de dropdowns
  ) {
    return
  }

  // criando o container de checkboxes
  const checkBoxContainer = new CheckboxContainer("checkbox-container")

  // criando o container de dropdowns
  const pickDropdownContainer = new DropdownChampionsContainer("pick-dropdown-container")
  const banDropdownContainer = new DropdownChampionsContainer("ban-dropdown-container")

  // instanciando as checkboxes
  const pickCheckbox = new AutoCheckbox("Auto pick", "pickChampion")
  const banCheckbox = new AutoCheckbox("Auto ban", "banChampion")

  // instanciando os dropdowns
  const firstPickDropdown = new DropdownChampions(0, "pickChampion", allChampions, "First pick option")
  const secondPickDropdown = new DropdownChampions(1, "pickChampion", allChampions, "Second pick option")

  const firstBanDropdown = new DropdownChampions(0, "banChampion", allChampions, "First ban option", true)
  const secondBanDropdown = new DropdownChampions(1, "banChampion", allChampions, "Second ban option", true)

  // adicionando os elementos aos containers
  checkBoxContainer.element.append(pickCheckbox.element, banCheckbox.element)
  pickDropdownContainer.element.append(firstPickDropdown.element, secondPickDropdown.element)
  banDropdownContainer.element.append(firstBanDropdown.element, secondBanDropdown.element)

  // adicionando os elementos ao container social
  socialContainer.append(checkBoxContainer.element, pickDropdownContainer.element, banDropdownContainer.element)
}

window.addEventListener("load", async () => {
  console.debug(`${plugin.name}: Report bugs to Balaclava#1912`)
  allChampions = await requests.getAllChampions()

  if (!DataStore.has("pickChampion")) { DataStore.set("pickChampion", defaultPickSettings) }
  if (!DataStore.has("banChampion")) { DataStore.set("banChampion", defaultBanSettings) }

  linkEndpoint("/lol-gameflow/v1/gameflow-phase", gamePhaseHandler)
  addRoutines(onMutation)
})
