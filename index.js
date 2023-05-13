import utils from "../_utils"
import config from "./config.json"
import * as requests from "./requests.js"

const banChampion = config.banChampion
const pickChampion = config.pickChampion

const gamePhaseHandler = async message => {
  const jsonObject = JSON.parse(message.data)
  const messageData = jsonObject[2]["data"]
  if (messageData !== "ChampSelect") { return }

  const intervalId = setInterval(async () => {
    const gamePhase = await requests.getGamePhase()
    if (gamePhase !== "ChampSelect") { clearInterval(intervalId) }
    else {
      const championSelectData = await requests.getChampionSelectData()
      await actionHandler(championSelectData)
    }
  }, 250)
}

const actionHandler = async championSelectData => {
  const localPlayerCellId = championSelectData.localPlayerCellId // id do jogador local
  const actions = championSelectData.actions // ações da seleção de campeão

  const teamBans = championSelectData.bans.myTeamBans // banimento dos aliados
  const enemyBans = championSelectData.bans.theirTeamBans // banimento dos inimigos
  const allBans = [...teamBans, ...enemyBans] // todos os banimentos

  const teamPicks = championSelectData.myTeam // escolha dos aliados
  const enemyPicks = championSelectData.theirTeam // escolha dos inimigos
  const allPicks = [...teamPicks, ...enemyPicks] // todas as escolhas

  for (let subAction of actions) {
    for (let action of subAction) {
      // buscando apenas por ações do usuário local que não foram completadas
      if (action.completed || action.actorCellId != localPlayerCellId) { continue }

      if (action.type === "pick" && pickChampion.enabled) { // se é a vez de escolher um campeão
        for (let championId of pickChampion.ids) {
          if (allBans.some(bannedChampionId => bannedChampionId == championId)) { continue } // se alguém já baniu o campeão
          if (allPicks.some(unit => unit.championId == championId)) { continue } // se alguém já pegou o campeão
          if (await requests.selectChampion(action.id, championId)) { return }
        }
      }

      if (action.type === "ban" && banChampion.enabled) { // se é a vez de banir um campeão
        for (let championId of banChampion.ids) {
          if (allBans.some(bannedChampionId => bannedChampionId == championId)) { continue } // se alguém já baniu o campeão
          if (!banChampion.force && teamPicks.some(ally => ally.championPickIntent == championId)) { continue }  // se o force tá desativado, se algum aliado quer o campeão
          if (await requests.selectChampion(action.id, championId)) { return }
        }
      }
    }
  }
}

window.addEventListener("load", () => {
  let url = "/lol-gameflow/v1/gameflow-phase"
  utils.subscribe_endpoint(url, gamePhaseHandler)
})