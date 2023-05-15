import utils from "../_utils"
import config from "./config.json"
import * as requests from "./requests"
import * as front from "./front"

/**
 * @author Yan Gabriel <Balaclava#1912>
 */

const banChampion = config.banChampion
const pickChampion = config.pickChampion

let allChampions = null

const gamePhaseHandler = async message => {
  const jsonObject = JSON.parse(message.data)
  const messageData = jsonObject[2]["data"]
  if (messageData !== "ChampSelect") { return }

  while (await requests.getGamePhase() === "ChampSelect") {
    const championSelectData = await requests.getChampionSelectData()
    await onChampionSelect(championSelectData)

    // sair do while caso `championSelectData.timer.phase` for finalization
    if (championSelectData.timer.phase === "FINALIZATION") { return }

    // delay de 1 segundo pra não sobrecarregar o lcu
    await new Promise(resolve => setTimeout(resolve, 200))
  }
}

const onChampionSelect = async championSelectData => {
  const { localPlayerCellId, actions, bans, myTeam, theirTeam } = championSelectData
  const allBans = [...bans.myTeamBans, ...bans.theirTeamBans]
  const allPicks = [...myTeam, ...theirTeam]

  for (const subAction of actions) {
    for (const action of subAction) {
      // buscando apenas por ações do usuário local que não foram completadas
      if (action.completed || action.actorCellId != localPlayerCellId) { continue }

      if (action.type === "pick" && pickChampion.enabled) { // se é a vez de escolher um campeão
        for (const championId of pickChampion.ids) {
          if (allBans.some(bannedChampionId => bannedChampionId == championId)) { continue } // se alguém já baniu o campeão
          if (allPicks.some(unit => unit.championId == championId)) { continue } // se alguém já pegou o campeão
          if (await requests.selectChampion(action.id, championId)) { return } else { break }
        }
      }

      if (action.type === "ban" && banChampion.enabled) { // se é a vez de banir um campeão
        for (const championId of banChampion.ids) {
          if (allBans.some(bannedChampionId => bannedChampionId == championId)) { continue } // se alguém já baniu o campeão
          if (!banChampion.force && myTeam.some(ally => ally.championPickIntent == championId)) { continue }  // se o force tá desativado, se algum aliado quer o campeão
          if (await requests.selectChampion(action.id, championId)) { return } else { break }
        }
      }
    }
  }
}

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
    const dropdownConfig = config[dropdownId]
    const option = front.getOption(champion.name)
    option.addEventListener("click", function () { dropdownConfig["ids"][index] = champion.id })
    if (dropdownConfig["ids"][index] == champion.id) { option.setAttribute("selected", "true") }
    return option
  }
}

/** 
 * Cria os elementos do plugin quando o container for modificado.
 */
const onMutation = () => {
  const socialContainer = document.querySelector(".lol-social-lower-pane-container")

  if ( // verificando se vale a pena criar os elementos
    !socialContainer || // se o container existe no documento
    document.getElementById("pickChampion") || // dropdown de pick
    document.getElementById("banChampion") || // dropdown de ban
    document.getElementById("check-box-container") // checkboxes
  ) {
    return
  }

  // instanciando os dropdowns (criando os elementos)
  const firstPickDropdown = new DropdownChampions(0, "pickChampion")
  const secondPickDropdown = new DropdownChampions(1, "pickChampion")

  const firstBanDropdown = new DropdownChampions(0, "banChampion", "0.7")
  const secondBanDropdown = new DropdownChampions(1, "banChampion", "0.7")

  // configurando os dropdowns (configurando as opções que os dropdowns possuem)
  secondPickDropdown.setup(allChampions)
  firstPickDropdown.setup(allChampions)

  firstBanDropdown.setup(allChampions)
  secondBanDropdown.setup(allChampions)

  // instanciando as checkboxes
  const checkBoxContainer = document.createElement("div")
  checkBoxContainer.setAttribute("id", "check-box-container")
  checkBoxContainer.className = "alpha-version-panel"

  const pickCheckbox = getAutoCheckbox("Auto pick", "pickChampion")
  const banCheckbox = getAutoCheckbox("Auto ban", "banChampion")

  checkBoxContainer.append(pickCheckbox)
  checkBoxContainer.append(banCheckbox)

  // adicionando as checkboxes
  socialContainer.append(checkBoxContainer)

  // adicionando os dropdowns
  socialContainer.append(firstPickDropdown.element)
  socialContainer.append(secondPickDropdown.element)

  socialContainer.append(firstBanDropdown.element)
  socialContainer.append(secondBanDropdown.element)
}

const getAutoCheckbox = (text, configName) => {
  const checkBoxStatus = config[configName]["enabled"]
  const pickCheckbox = front.getCheckBox(text, checkBoxStatus)

  pickCheckbox.addEventListener("click", function () {
    config[configName]["enabled"] = !config[configName]["enabled"] // se estiver ligado, vai ser desligado
    config[configName]["enabled"] ? pickCheckbox.setAttribute("selected", "true") : pickCheckbox.removeAttribute("selected")
  })

  return pickCheckbox
}

window.addEventListener("load", () => {
  console.log("Feito com carinho pelo Balaclava")
  requests.getAllChampions() // a request é feita apenas uma vez
    .then(champions => allChampions = champions)
    .finally(console.log("Campeões requisitados!"))

  utils.subscribe_endpoint("/lol-gameflow/v1/gameflow-phase", gamePhaseHandler)
  utils.routineAddCallback(onMutation, ["lol-social-lower-pane-container"])
})
