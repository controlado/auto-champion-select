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
    await new Promise(resolve => setTimeout(resolve, 1000))
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
          if (await requests.selectChampion(action.id, championId)) { return }
        }
      }

      if (action.type === "ban" && banChampion.enabled) { // se é a vez de banir um campeão
        for (const championId of banChampion.ids) {
          if (allBans.some(bannedChampionId => bannedChampionId == championId)) { continue } // se alguém já baniu o campeão
          if (!banChampion.force && myTeam.some(ally => ally.championPickIntent == championId)) { continue }  // se o force tá desativado, se algum aliado quer o campeão
          if (await requests.selectChampion(action.id, championId)) { return }
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
    const option = front.getOption(champion.name)
    option.addEventListener("click", function () { config[dropdownId]["ids"][index] = champion.id })
    if (config[dropdownId]["ids"][index] == champion.id) { option.setAttribute("selected", "true") }
    return option
  }
}

const onMutation = () => {
  if (!document.querySelector(".lol-social-lower-pane-container")) { return }
  if (document.getElementById("pickChampion") || document.getElementById("banChampion")) { return }

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

  // lugar aonde os dropdowns vão ser colocados
  const header = document.querySelector(".lol-social-lower-pane-container")

  // adicionando os dropdowns
  header.append(firstPickDropdown.element)
  header.append(secondPickDropdown.element)

  header.append(firstBanDropdown.element)
  header.append(secondBanDropdown.element)
}


window.addEventListener("load", () => {
  console.log("Feito com carinho pelo Balaclava")
  requests.getAllChampions() // a request é feita apenas uma vez
    .then(champions => allChampions = champions)
    .finally(console.log("Campeões requisitados!"))

  utils.subscribe_endpoint("/lol-gameflow/v1/gameflow-phase", gamePhaseHandler)
  utils.routineAddCallback(onMutation, ["lol-social-lower-pane-container"])
})
