/**
 * @author Yan Gabriel <Balaclava#1912>
 */

/**
 * Realiza uma requisição HTTP usando o método especificado e os parâmetros passados.
 *
 * @async
 * @function
 * @param {string} method O método HTTP a ser utilizado.
 * @param {string} url URL da API que será consultada.
 * @param {Object} [userBody] Corpo da requisição.
 * @returns {Promise<Response>} Resposta da API.
 */
const request = async (method, url, userBody = null) => {
    let requestParams = {
        "method": method,
        "headers": {
            "accept": "application/json",
            "content-type": "application/json",
        }
    }
    if (userBody) { requestParams.body = JSON.stringify(userBody) }
    return await fetch(url, requestParams)
}

/** 
 * Seleciona um campeão na fase de seleção de campeões.
 *
 * @async
 * @function
 * @param {string} actionId ID da ação que vai ser realizada, como banimento ou confirmação de campeão.
 * @param {string} championId ID do campeão que vai ser alvo da ação.
 * @param {boolean} [completed=true] Indica se a ação deve ser confirmada ou não.
 * @return {Promise<boolean>} Um valor `true` se foi possível selecionar o campeão, e em `false` caso contrário.
 */
export async function selectChampion(actionId, championId, completed = true) {
    const url = `/lol-champ-select/v1/session/actions/${actionId}`
    const body = {
        "completed": completed,
        "championId": championId,
    }
    const response = await request("PATCH", url, body)
    if (!response.ok) { return false }
    return true // solicitação bem sucedida
}

/** 
 * Obtém informações sobre a seleção de campeões atual.
 *
 * @async
 * @function
 * @return {Promise<JSON>} Informações da seleção de campeões.
 */
export async function getChampionSelectData() {
    const url = "/lol-champ-select/v1/session"
    const response = await request("GET", url)
    return await response.json()
}

/** 
 * Obtém informações sobre a fase atual do jogo.
 *
 * @async
 * @function
 * @summary Pode ser "ChampSelect", "None", entre outras.
 * @return {Promise<JSON>} Informações da fase atual.
 */
export async function getGamePhase() {
    const url = "/lol-gameflow/v1/gameflow-phase"
    const response = await request("GET", url)
    return await response.json()
}

/** 
 * Obtém uma array com os campeões disponíveis para selecionar.
 * 
 * @async
 * @function
 * @return {Promise<JSON>} Resposta da requisição.
 */
export async function getPlayableChampions() {
    const url = `/lol-champions/v1/owned-champions-minimal`
    const response = await request("GET", url)
    return await response.json()
}
