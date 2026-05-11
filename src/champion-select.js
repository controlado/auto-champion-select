import { request, sleep } from "https://cdn.jsdelivr.net/npm/balaclava-utils@latest";
import { toChampionId } from "./champion-ids.js";
import { readConfig } from "./config-store.js";
import { getAllowedPositionsForChampion, isChampionAllowedInPosition, normalizePosition } from "./champion-positions.js";
import { LEAGUE_CLIENT_ENDPOINTS } from "./league-client-endpoints.js";

/**
 * @typedef {"applied" | "try-next-champion" | "abort-action"} ActionAttemptResult
 *
 * @typedef {Object} ChampSelectAction
 * @property {number} id
 * @property {number} actorCellId
 * @property {string} type Champ-select action type returned by the LCU API; this plugin only applies pick and ban actions.
 * @property {boolean} completed
 * @property {boolean} [isInProgress]
 * @property {unknown} [championId]
 *
 * @typedef {Object} ChampSelectPlayer
 * @property {number} cellId
 * @property {unknown} championId
 * @property {unknown} championPickIntent
 * @property {unknown} [assignedPosition]
 *
 * @typedef {Object} ChampSelectSession
 * @property {number} localPlayerCellId
 * @property {ChampSelectAction[][]} actions
 * @property {ChampSelectPlayer[]} [myTeam]
 * @property {ChampSelectPlayer[]} [theirTeam]
 * @property {{myTeamBans?: unknown[], theirTeamBans?: unknown[]}} [bans]
 *
 * @typedef {Object} AutoSelectConfig
 * @property {boolean} enabled
 * @property {boolean} [force]
 * @property {number[]} champions
 * @property {Record<string, string[]>} [positionsByChampionId]
 */

const CHAMP_SELECT_WATCH_INTERVAL_MS = 300;

/** @type {Readonly<Record<"APPLIED" | "TRY_NEXT_CHAMPION" | "ABORT_ACTION", ActionAttemptResult>>} */
const ACTION_ATTEMPT_RESULT = Object.freeze({
    APPLIED: "applied",
    TRY_NEXT_CHAMPION: "try-next-champion",
    ABORT_ACTION: "abort-action"
});

/**
 * @param {unknown} actions
 * @returns {ChampSelectAction[]}
 */
function flattenActionGroups(actions) {
    return Array.isArray(actions) ? actions.flat() : [];
}

/**
 * @param {unknown} actions
 * @returns {unknown[]}
 */
function getCompletedBanChampionIds(actions) {
    return flattenActionGroups(actions)
        .filter(action => action.type === "ban" && action.completed === true)
        .map(action => action.championId);
}

/**
 * @param {unknown} players
 * @returns {ChampSelectPlayer[]}
 */
function getTeamPlayers(players) {
    return Array.isArray(players) ? players : [];
}

/**
 * @param {Iterable<unknown>} values
 * @returns {Set<number>}
 */
function championIdSetFromValues(values) {
    const championIds = new Set();

    for (const value of values) {
        const championId = toChampionId(value);
        if (championId !== null) {
            championIds.add(championId);
        }
    }

    return championIds;
}

/**
 * @param {ChampSelectAction} action
 * @returns {0 | 1}
 */
function getActionTypePriority(action) {
    return action.type === "pick" ? 0 : 1;
}

/**
 * @returns {{pickConfig: AutoSelectConfig, banConfig: AutoSelectConfig}}
 */
function readAutoSelectConfigs() {
    return {
        pickConfig: readConfig("controladoPick"),
        banConfig: readConfig("controladoBan")
    };
}

export class ChampionSelect {
    constructor() {
        /** @type {ChampSelectSession | null} */
        this.session = null;
        /** @type {ChampSelectAction[][] | null} */
        this.actions = null;

        /** @type {number | null} */
        this.localPlayerCellId = null;
        /** @type {Set<number>} */
        this.teammateIntentChampionIds = new Set();
        /** @type {number | null} */
        this.localPlayerIntentChampionId = null;
        /** @type {Set<number>} */
        this.pickedChampionIds = new Set();
        /** @type {Set<number>} */
        this.bannedChampionIds = new Set();
        /** @type {string | null} */
        this.localPlayerAssignedPosition = null;

        /** @type {Promise<void> | null} */
        this.watchTask = null;
        this.watchVersion = 0;
        this.mounted = false;
    }

    mount() {
        if (this.mounted) {
            return;
        }
        this.mounted = true;
        this.watchVersion += 1;

        if (!this.watchTask) {
            this.watchTask = this.watch();
        }
    }

    unmount() {
        if (!this.mounted) {
            return;
        }
        this.mounted = false;
        this.watchVersion += 1;
    }

    async watch() {
        try {
            while (this.mounted) {
                const version = this.watchVersion;
                let sessionRefreshed = false;

                try {
                    await this.refreshSessionState();
                    sessionRefreshed = true;
                } catch (error) {
                    console.debug("auto-champion-select: Failed to update champion select", error);
                }

                if (!sessionRefreshed || !this.mounted || version !== this.watchVersion) {
                    if (this.mounted && version === this.watchVersion) {
                        await sleep(CHAMP_SELECT_WATCH_INTERVAL_MS);
                    }
                    continue;
                }

                try {
                    await this.runAutoSelectCycle();
                } catch (error) {
                    console.debug("auto-champion-select: Failed to run champion select cycle", error);
                }

                if (this.mounted && version === this.watchVersion) {
                    await sleep(CHAMP_SELECT_WATCH_INTERVAL_MS);
                }
            }
        } finally {
            this.watchTask = null;
        }
    }

    async refreshSessionState() {
        const sessionResponse = await request("GET", LEAGUE_CLIENT_ENDPOINTS.champSelectSession);
        if (!sessionResponse.ok) {
            throw new Error(`Session request failed with status ${sessionResponse.status}`);
        }

        this.session = await sessionResponse.json();
        this.actions = this.session.actions;

        this.localPlayerCellId = this.session.localPlayerCellId;
        const alliedTeam = getTeamPlayers(this.session.myTeam);
        const opposingTeam = getTeamPlayers(this.session.theirTeam);
        const localPlayer = alliedTeam.find(player => player.cellId === this.localPlayerCellId);
        this.localPlayerAssignedPosition = normalizePosition(localPlayer?.assignedPosition);
        this.localPlayerIntentChampionId = toChampionId(localPlayer?.championPickIntent);

        this.pickedChampionIds = championIdSetFromValues([...alliedTeam, ...opposingTeam].map(player => player.championId));
        this.bannedChampionIds = championIdSetFromValues([
            ...(this.session.bans?.myTeamBans || []),
            ...(this.session.bans?.theirTeamBans || []),
            ...getCompletedBanChampionIds(this.actions)
        ]);
        this.teammateIntentChampionIds = championIdSetFromValues(alliedTeam.map(player => player.championPickIntent));
    }

    async runAutoSelectCycle() {
        const { pickConfig, banConfig } = readAutoSelectConfigs();

        if (!pickConfig.enabled && !banConfig.enabled) {
            return;
        }

        const localPlayerActions = this.getLocalPlayerActions();
        if (localPlayerActions.length === 0) {
            console.debug("auto-champion-select: No local player sub actions found, skipping...");
            this.unmount();
            return;
        }

        for (const action of localPlayerActions) {
            if (!this.isActionAvailable(action)) {
                continue;
            }

            const config = this.getConfigForActionType(action.type, { pickConfig, banConfig });
            if (!config?.enabled) {
                continue;
            }

            for (const championId of config.champions) {
                const result = await this.attemptChampionForAction(action, championId, config);
                if (result === ACTION_ATTEMPT_RESULT.APPLIED) {
                    break;
                }

                if (result === ACTION_ATTEMPT_RESULT.ABORT_ACTION) {
                    return;
                }
            }
        }
    }

    /**
     * @returns {ChampSelectAction[]}
     */
    getLocalPlayerActions() {
        return flattenActionGroups(this.actions)
            .filter(action => this.isPendingLocalPlayerAction(action))
            .sort((a, b) => getActionTypePriority(a) - getActionTypePriority(b));
    }

    /**
     * @param {ChampSelectAction} action
     * @returns {boolean}
     */
    isPendingLocalPlayerAction(action) {
        return action.actorCellId === this.localPlayerCellId && action.completed === false;
    }

    /**
     * @param {ChampSelectAction} action
     * @returns {boolean}
     */
    isActionAvailable(action) {
        return action.type === "pick" || action.isInProgress === true;
    }

    /**
     * @param {string} actionType
     * @param {{pickConfig: AutoSelectConfig, banConfig: AutoSelectConfig}} configs
     * @returns {AutoSelectConfig | null}
     */
    getConfigForActionType(actionType, configs) {
        if (actionType === "pick") return configs.pickConfig;
        if (actionType === "ban") return configs.banConfig;
        return null;
    }

    /**
     * @param {ChampSelectAction} action
     * @param {unknown} championId
     * @param {AutoSelectConfig} config
     * @returns {Promise<ActionAttemptResult>}
     */
    async attemptChampionForAction(action, championId, config) {
        const normalizedChampionId = toChampionId(championId);
        if (normalizedChampionId === null || this.isChampionUnavailableForAction(action, normalizedChampionId, config)) {
            return ACTION_ATTEMPT_RESULT.TRY_NEXT_CHAMPION;
        }

        if (this.isPickIntentAlreadyApplied(action, normalizedChampionId)) {
            return ACTION_ATTEMPT_RESULT.APPLIED;
        }

        console.debug(`auto-champion-select: Trying to ${action.type} ${normalizedChampionId}...`);
        const response = await this.selectChampion(action.id, normalizedChampionId);
        if (response.ok) {
            return ACTION_ATTEMPT_RESULT.APPLIED;
        }

        console.debug(`auto-champion-select: Failed to ${action.type} ${normalizedChampionId}, refreshing champ select state...`);
        const updatedAction = await this.refreshActionAfterFailedAttempt(action);
        if (!updatedAction || !this.isActionAvailable(updatedAction)) {
            return ACTION_ATTEMPT_RESULT.ABORT_ACTION;
        }

        if (!this.isChampionUnavailableForAction(updatedAction, normalizedChampionId, config)) {
            return ACTION_ATTEMPT_RESULT.ABORT_ACTION;
        }

        console.debug(`auto-champion-select: ${normalizedChampionId} is unavailable after refresh, trying next ${action.type}...`);
        return ACTION_ATTEMPT_RESULT.TRY_NEXT_CHAMPION;
    }

    /**
     * @param {ChampSelectAction} action
     * @param {number} championId
     * @returns {boolean}
     */
    isPickIntentAlreadyApplied(action, championId) {
        return action.type === "pick" &&
            action.isInProgress !== true &&
            (this.localPlayerIntentChampionId === championId || toChampionId(action.championId) === championId);
    }

    /**
     * @param {ChampSelectAction} action
     * @returns {Promise<ChampSelectAction | null>}
     */
    async refreshActionAfterFailedAttempt(action) {
        try {
            await this.refreshSessionState();
        } catch (error) {
            console.debug("auto-champion-select: Failed to refresh champion select after select failure", error);
            return null;
        }

        return flattenActionGroups(this.actions).find(updatedAction =>
            updatedAction.id === action.id &&
            updatedAction.actorCellId === action.actorCellId &&
            updatedAction.type === action.type &&
            updatedAction.completed === false
        ) || null;
    }

    /**
     * @param {ChampSelectAction} action
     * @param {number} championId
     * @param {AutoSelectConfig} config
     * @returns {boolean}
     */
    isChampionUnavailableForAction(action, championId, config) {
        if (action.type === "pick" && !isChampionAllowedInPosition(config, championId, this.localPlayerAssignedPosition)) {
            const allowedPositions = getAllowedPositionsForChampion(config, championId);
            if (this.localPlayerAssignedPosition) {
                console.debug(`auto-champion-select: Picking ${championId} but assigned position ${this.localPlayerAssignedPosition} is not in ${allowedPositions.join(", ")}, skipping...`);
            } else {
                console.debug(`auto-champion-select: Picking ${championId} but no assigned position is available for ${allowedPositions.join(", ")} restriction, skipping...`);
            }
            return true;
        }

        if (this.bannedChampionIds.has(championId)) {
            console.debug(`auto-champion-select: Banning ${championId} but it's already banned, skipping...`);
            return true;
        }

        if (action.type === "ban" && this.teammateIntentChampionIds.has(championId)) {
            if (config.force === true) {
                console.debug(`auto-champion-select: Banning ${championId} but it's already picked, forcing...`);
            } else {
                console.debug(`auto-champion-select: Banning ${championId} but it's already picked, skipping...`);
                return true;
            }
        }

        if (action.type === "pick" && this.pickedChampionIds.has(championId)) {
            if (config.force === true) {
                console.debug(`auto-champion-select: Picking ${championId} but it's already picked, forcing...`);
            } else {
                console.debug(`auto-champion-select: Picking ${championId} but it's already picked, skipping...`);
                return true;
            }
        }

        return false;
    }

    /**
     * @param {number} actionId
     * @param {number} championId
     * @returns {Promise<Response>}
     */
    selectChampion(actionId, championId) {
        const endpoint = LEAGUE_CLIENT_ENDPOINTS.champSelectAction(actionId);
        const body = { championId, completed: true };
        return request("PATCH", endpoint, { body });
    }
}
