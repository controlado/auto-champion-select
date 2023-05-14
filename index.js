import utils from "../_utils"
import config from "./config.json"
import * as requests from "./requests"

/**
 * @author Yan Gabriel <Balaclava#1912>
 */

const banChampion = config.banChampion
const pickChampion = config.pickChampion

const gamePhaseHandler = async message => {
  const jsonObject = JSON.parse(message.data)
  const messageData = jsonObject[2]["data"]
  if (messageData !== "ChampSelect") { return }

  while (await requests.getGamePhase() === "ChampSelect") {
      const championSelectData = await requests.getChampionSelectData()
    await onChampionSelect(championSelectData)

    // sair do while caso `championSelectData.timer.phase` for finalization
    if (championSelectData.timer.phase === "FINALIZATION") { console.log("sucesso!"); return }

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

window.addEventListener("load", () => {
  let url = "/lol-gameflow/v1/gameflow-phase"
  utils.subscribe_endpoint(url, gamePhaseHandler)
})