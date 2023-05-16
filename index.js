import utils from "../_utils"
import * as requests from "./requests"
import * as front from "./front"

/**
 * @author Yan Gabriel <Balaclava#1912>
 */

let allChampions = null // todos os campeões disponíveis no jogo
const defaultPickSettings = { "enabled": false, "champions": [429, 136] }
const defaultBanSettings = { "enabled": false, "force": false, "champions": [350, 221] }

const gamePhaseHandler = async message => {
  const jsonObject = JSON.parse(message.data)
  const messageData = jsonObject[2]["data"]
  if (messageData !== "ChampSelect") { return }

  while (await requests.getGamePhase() === "ChampSelect") {
    const championSelectData = await requests.getChampionSelectData()
    await onChampionSelect(championSelectData)

    // sair do while caso `championSelectData.timer.phase` for finalization
    if (championSelectData.timer.phase === "FINALIZATION") { return }

    // delay básico pra não sobrecarregar o lcu
    await new Promise(resolve => setTimeout(resolve, 200))
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
          if (allPicks.some(unit => unit.championId == championId)) { continue } // se alguém já pegou o campeão
          if (await requests.selectChampion(action.id, championId)) { return } else { break }
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
    const userValues = DataStore.get(dropdownId)
    const option = front.getOption(champion.name)

    // configurar campeão que foi selecionado no dropdown
    option.addEventListener("click", function () {
      const eventUserValues = DataStore.get(dropdownId)
      eventUserValues.champions[index] = champion.id
      DataStore.set(dropdownId, eventUserValues)
    })

    // verificando se já existe um campeão configurado
    if (userValues.champions[index] == champion.id) {
      option.setAttribute("selected", "true")
    }

    return option
  }
}

/**
 * Cria os elementos do plugin quando o container for modificado.
 */
const onMutation = async () => {
  const socialContainer = document.querySelector(".lol-social-lower-pane-container")

  if ( // verificando se vale a pena criar os elementos
    !socialContainer || // se o container existe no documento
    document.getElementById("checkbox-container") || // container de checkboxes
    document.getElementById("pick-dropdown-container") || // container de dropdowns
    document.getElementById("ban-dropdown-container") // container de dropdowns
  ) {
    return
  }

  const playableChampions = await requests.getPlayableChampions()
  if (!playableChampions) { return } // se o client ainda não está pronto

  // criando o container de checkboxes
  const checkBoxContainer = document.createElement("div")
  checkBoxContainer.setAttribute("id", "checkbox-container")
  checkBoxContainer.className = "alpha-version-panel"

  // criando o container de dropdowns pra pick
  const pickDropdownContainer = document.createElement("div")
  pickDropdownContainer.setAttribute("id", "pick-dropdown-container")

  // criando o container de dropdowns de ban
  const banDropdownContainer = document.createElement("div")
  banDropdownContainer.setAttribute("id", "ban-dropdown-container")

  // instanciando as checkboxes
  const pickCheckbox = getAutoCheckbox("Auto pick", "pickChampion")
  const banCheckbox = getAutoCheckbox("Auto ban", "banChampion")

  // instanciando os dropdowns
  const firstPickDropdown = new DropdownChampions(0, "pickChampion")
  const secondPickDropdown = new DropdownChampions(1, "pickChampion")
  secondPickDropdown.setup(playableChampions)
  firstPickDropdown.setup(playableChampions)

  const firstBanDropdown = new DropdownChampions(0, "banChampion", "0.7")
  const secondBanDropdown = new DropdownChampions(1, "banChampion", "0.7")
  firstBanDropdown.setup(allChampions)
  secondBanDropdown.setup(allChampions)

  // adicionando os elementos aos containers
  checkBoxContainer.append(pickCheckbox)
  checkBoxContainer.append(banCheckbox)

  pickDropdownContainer.append(firstPickDropdown.element)
  pickDropdownContainer.append(secondPickDropdown.element)

  banDropdownContainer.append(firstBanDropdown.element)
  banDropdownContainer.append(secondBanDropdown.element)

  // adicionando os elementos ao container social
  socialContainer.append(checkBoxContainer)
  socialContainer.append(pickDropdownContainer)
  socialContainer.append(banDropdownContainer)
}

const getAutoCheckbox = (text, configName) => {
  const userValues = DataStore.get(configName)
  const pickCheckbox = front.getCheckBox(text, userValues.enabled)

  pickCheckbox.addEventListener("click", function () {
    const eventUserValues = DataStore.get(configName)
    eventUserValues.enabled = !eventUserValues.enabled
    DataStore.set(configName, eventUserValues)

    // ocultar container pai do elemento selecionado
    const element = document.getElementById(configName)

    if (eventUserValues.enabled) {
      pickCheckbox.setAttribute("selected", "true")
      element.parentNode.style.display = "block"
    } else {
      pickCheckbox.removeAttribute("selected")
      element.parentNode.style.display = "none"
    }
  })

  return pickCheckbox
}

window.addEventListener("load", () => {
  console.log("Feito com carinho pelo Balaclava")
  requests.getAllChampions() // a request é feita apenas uma vez
    .then(champions => allChampions = champions)
    .finally(console.log("Campeões requisitados!"))

  const pickChampionExists = DataStore.has("pickChampion")
  const banChampionExists = DataStore.has("banChampion")

  if (!pickChampionExists) { DataStore.set("pickChampion", defaultPickSettings) }
  if (!banChampionExists) { DataStore.set("banChampion", defaultBanSettings) }

  if (pickChampionExists && banChampionExists) { console.log("Configurações existentes recuperadas") }
  else { console.log("Configurações de usuário não encontradas, valores padrões configurados") }

  utils.subscribe_endpoint("/lol-gameflow/v1/gameflow-phase", gamePhaseHandler)
  utils.routineAddCallback(onMutation, ["lol-social-lower-pane-container"])
})
