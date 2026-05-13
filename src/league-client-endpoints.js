export const LEAGUE_CLIENT_ENDPOINTS = Object.freeze({
    readyCheckAccept: "/lol-matchmaking/v1/ready-check/accept",
    gameflowPhase: "/lol-gameflow/v1/gameflow-phase",
    wallet: "/lol-inventory/v1/wallet",
    ownedChampions: "/lol-champions/v1/owned-champions-minimal",
    championSummary: "/lol-game-data/assets/v1/champion-summary.json",
    recommendedChampionPositions: "/lol-perks/v1/recommended-champion-positions",
    champSelectSession: "/lol-champ-select/v1/session",

    /**
     * @param {number} championId
     * @returns {string}
     */
    championIcon(championId) {
        return `/lol-game-data/assets/v1/champion-icons/${championId}.png`;
    },

    /**
     * @param {number} actionId
     * @returns {string}
     */
    champSelectAction(actionId) {
        return `/lol-champ-select/v1/session/actions/${actionId}`;
    }
});
