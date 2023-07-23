import { request } from "https://cdn.skypack.dev/balaclava-utils@latest";

/**
 * @author balaclava
 * @name auto-champion-select
 * @link https://github.com/controlado/auto-champion-select
 * @description Pick or ban automatically! 🐧
 */

/**
 * Seleciona um campeão na fase de seleção de campeões.
 *
 * @async
 * @function
 * @param {string} actionId - ID da ação que vai ser realizada, como banimento ou confirmação de campeão.
 * @param {string} championId - ID do campeão que vai ser alvo da ação.
 * @param {boolean} [completed=true] - Indica se a ação deve ser confirmada ou não.
 * @return {Promise<boolean>} Um valor `true` se foi possível selecionar o campeão, e em `false` caso contrário.
 */
export async function selectChampion(actionId, championId, completed = true) {
  const url = `/lol-champ-select/v1/session/actions/${actionId}`;
  const body = { completed: completed, championId: championId };
  const response = await request("PATCH", url, { body });
  return response.ok;
}

/**
 * Obtém informações sobre a seleção de campeões atual.
 *
 * @async
 * @function
 * @return {Promise<Object>} Informações da seleção de campeões.
 */
export async function getChampionSelectData() {
  const response = await request("GET", "/lol-champ-select/v1/session");
  return response.json();
}

/**
 * Obtém informações sobre a fase atual do jogo.
 *
 * @async
 * @function
 * @summary Pode ser "ChampSelect", "None", entre outras.
 * @return {Promise<string>} Informações da fase atual.
 */
export async function getGamePhase() {
  const response = await request("GET", "/lol-gameflow/v1/gameflow-phase");
  return response.json();
}

/**
 * Retorna uma array em ordem alfabética contendo os dados de todos os campeões.
 *
 * @async
 * @function
 * @param {string} - Idioma dos dados.
 * @return {Promise<Object[]>} Os dados de todos os campeões.
 */
export async function getAllChampions() {
  const response = await request("GET", "/lol-game-data/assets/v1/champion-summary.json");
  const responseData = await response.json();

  // ordenando os campeões em ordem alfabética
  responseData.sort((a, b) => a.name.localeCompare(b.name));

  return responseData;
}
