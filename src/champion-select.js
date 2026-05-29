import { request, sleep } from "https://cdn.jsdelivr.net/npm/balaclava-utils@latest";
import { normalizeChampionIds, toChampionId } from "./champion-ids.js";
import { readConfig } from "./config-store.js";
import { getAllChampions, getRecommendedChampionPositionsById } from "./champion-data.js";
import { getAllowedPositionsForChampion, isChampionAllowedInPosition, normalizePosition, normalizePositionList } from "./champion-positions.js";
import { isBraveryChampionOption, isRandomChampionOption, normalizeChampionPriorityOptions } from "./champion-priority-options.js";
import { getRandomActionDelayMs } from "./action-delay.js";
import { LEAGUE_CLIENT_ENDPOINTS } from "./league-client-endpoints.js";

/**
 * @typedef {import("./champion-priority-options.js").ChampionPriorityOption} ChampionPriorityOption
 *
 * @typedef {"satisfied" | "try-next-champion" | "stop-cycle"} ActionAttemptResult
 * @typedef {"continue-cycle" | "stop-cycle"} AutoSelectCycleResult
 * @typedef {"ready" | "skip-action" | "stop-cycle"} AutoSelectPlanStatus
 * @typedef {"satisfied" | "try-next-priority-option" | "stop-cycle"} PriorityOptionAttemptResult
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
 * @property {boolean} [pickIntent]
 * @property {number[]} champions
 * @property {ChampionPriorityOption[]} [priorityOptions]
 * @property {string[]} [randomAssignedPositions]
 * @property {string[]} [randomPoolPositions]
 * @property {Record<string, string[]>} [positionsByChampionId]
 *
 * @typedef {Object} ActionDelayConfig
 * @property {number} minMs
 * @property {number} maxMs
 *
 * @typedef {Object} AutoSelectConfigs
 * @property {AutoSelectConfig} pickConfig
 * @property {AutoSelectConfig} banConfig
 * @property {ActionDelayConfig} actionDelayConfig
 *
 * @typedef {Object} AutoSelectPlan
 * @property {ChampSelectAction} action
 * @property {AutoSelectConfig} config
 * @property {ChampionPriorityOption[]} priorityOptions
 *
 * @typedef {{status: "ready", plan: AutoSelectPlan} | {status: "skip-action" | "stop-cycle"}} AutoSelectPlanResult
 */

const CHAMP_SELECT_WATCH_INTERVAL_MS = 300;

const ANY_BANNABLE_CHAMPION_SENTINEL = -1;

const BRAVERY_CHAMPION_ID = -3;

/** @type {Readonly<Record<"SATISFIED" | "TRY_NEXT_CHAMPION" | "STOP_CYCLE", ActionAttemptResult>>} */
const ACTION_ATTEMPT_RESULT = Object.freeze({
    SATISFIED: "satisfied",
    TRY_NEXT_CHAMPION: "try-next-champion",
    STOP_CYCLE: "stop-cycle"
});

/** @type {Readonly<Record<"CONTINUE" | "STOP", AutoSelectCycleResult>>} */
const AUTO_SELECT_CYCLE_RESULT = Object.freeze({
    CONTINUE: "continue-cycle",
    STOP: "stop-cycle"
});

/** @type {Readonly<Record<"READY" | "SKIP_ACTION" | "STOP_CYCLE", AutoSelectPlanStatus>>} */
const AUTO_SELECT_PLAN_STATUS = Object.freeze({
    READY: "ready",
    SKIP_ACTION: "skip-action",
    STOP_CYCLE: "stop-cycle"
});

/** @type {Readonly<Record<"SATISFIED" | "TRY_NEXT_PRIORITY_OPTION" | "STOP_CYCLE", PriorityOptionAttemptResult>>} */
const PRIORITY_OPTION_ATTEMPT_RESULT = Object.freeze({
    SATISFIED: "satisfied",
    TRY_NEXT_PRIORITY_OPTION: "try-next-priority-option",
    STOP_CYCLE: "stop-cycle"
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
 * @returns {AutoSelectConfigs}
 */
function readAutoSelectConfigs() {
    return {
        pickConfig: readConfig("controladoPick"),
        banConfig: readConfig("controladoBan"),
        actionDelayConfig: readConfig("controladoActionDelay")
    };
}

/**
 * @param {number[]} championIds
 * @returns {number[]}
 */
function getShuffledChampionIds(championIds) {
    const shuffledChampionIds = [...championIds];
    for (let index = shuffledChampionIds.length - 1; index > 0; index--) {
        const randomIndex = Math.floor(Math.random() * (index + 1));
        [shuffledChampionIds[index], shuffledChampionIds[randomIndex]] = [shuffledChampionIds[randomIndex], shuffledChampionIds[index]];
    }

    return shuffledChampionIds;
}

/**
 * @param {unknown} championIds
 * @returns {boolean}
 */
function isAnyBannableChampionSentinel(championIds) {
    return Array.isArray(championIds) &&
        championIds.length === 1 &&
        championIds[0] === ANY_BANNABLE_CHAMPION_SENTINEL;
}

/**
 * @param {unknown} championId
 * @returns {boolean}
 */
function isBraveryChampionId(championId) {
    return Number(championId) === BRAVERY_CHAMPION_ID;
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
        this.alliedIntentChampionIds = new Set();
        /** @type {Set<number>} */
        this.teammateIntentChampionIds = new Set();
        /** @type {number | null} */
        this.localPlayerIntentChampionId = null;
        /** @type {boolean} */
        this.localPlayerIntentIsBravery = false;
        /** @type {Set<number>} */
        this.pickedChampionIds = new Set();
        /** @type {Set<number>} */
        this.bannedChampionIds = new Set();
        /** @type {string | null} */
        this.localPlayerAssignedPosition = null;
        /** @type {Set<number>} */
        this.rejectedBraveryActionIds = new Set();

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
        this.rejectedBraveryActionIds.clear();
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
        this.rejectedBraveryActionIds.clear();
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
        const teammatePlayers = alliedTeam.filter(player => player.cellId !== this.localPlayerCellId);
        this.localPlayerAssignedPosition = normalizePosition(localPlayer?.assignedPosition);
        this.localPlayerIntentChampionId = toChampionId(localPlayer?.championPickIntent);
        this.localPlayerIntentIsBravery = isBraveryChampionId(localPlayer?.championPickIntent);

        this.pickedChampionIds = championIdSetFromValues([...alliedTeam, ...opposingTeam].map(player => player.championId));
        this.bannedChampionIds = championIdSetFromValues([
            ...(this.session.bans?.myTeamBans || []),
            ...(this.session.bans?.theirTeamBans || []),
            ...getCompletedBanChampionIds(this.actions)
        ]);
        this.alliedIntentChampionIds = championIdSetFromValues(alliedTeam.map(player => player.championPickIntent));
        this.teammateIntentChampionIds = championIdSetFromValues(teammatePlayers.map(player => player.championPickIntent));
    }

    async runAutoSelectCycle() {
        const configs = readAutoSelectConfigs();

        if (!configs.pickConfig.enabled && !configs.banConfig.enabled) {
            return;
        }

        const localPlayerActions = this.getLocalPlayerActions();
        if (localPlayerActions.length === 0) {
            console.debug("auto-champion-select: No local player sub actions found, skipping...");
            this.unmount();
            return;
        }

        for (const action of localPlayerActions) {
            const result = await this.runAutoSelectForAction(action, configs);
            if (result === AUTO_SELECT_CYCLE_RESULT.STOP) {
                return;
            }
        }
    }

    /**
     * @param {ChampSelectAction} action
     * @param {AutoSelectConfigs} configs
     * @returns {Promise<AutoSelectCycleResult>}
     */
    async runAutoSelectForAction(action, configs) {
        const planResult = await this.prepareActionForAutoSelect(action, configs);
        switch (planResult.status) {
            case AUTO_SELECT_PLAN_STATUS.READY: return this.tryAutoSelectPlan(planResult.plan);
            case AUTO_SELECT_PLAN_STATUS.SKIP_ACTION: return AUTO_SELECT_CYCLE_RESULT.CONTINUE;
            case AUTO_SELECT_PLAN_STATUS.STOP_CYCLE: return AUTO_SELECT_CYCLE_RESULT.STOP;
            default: throw new Error(`Unexpected auto-select plan status: ${planResult.status}`);
        }
    }

    /**
     * @param {ChampSelectAction} action
     * @param {AutoSelectConfigs} configs
     * @returns {Promise<AutoSelectPlanResult>}
     */
    async prepareActionForAutoSelect(action, configs) {
        const config = this.getConfigForActionType(action.type, configs);
        if (!config?.enabled) {
            return { status: AUTO_SELECT_PLAN_STATUS.SKIP_ACTION };
        }

        if (!this.isActionAvailable(action, config)) {
            return { status: AUTO_SELECT_PLAN_STATUS.SKIP_ACTION };
        }

        const plan = this.createAutoSelectPlan(action, config);
        if (!plan) {
            return { status: AUTO_SELECT_PLAN_STATUS.SKIP_ACTION };
        }

        const alreadySatisfiedPlan = this.createPlanLimitedToAlreadySatisfiedPriorityOption(plan);
        if (alreadySatisfiedPlan) {
            return {
                status: AUTO_SELECT_PLAN_STATUS.READY,
                plan: alreadySatisfiedPlan
            };
        }

        const refreshedPlan = await this.delayAndRefreshAutoSelectPlan(action, config, configs.actionDelayConfig);
        if (!refreshedPlan) {
            return { status: AUTO_SELECT_PLAN_STATUS.STOP_CYCLE };
        }

        return {
            status: AUTO_SELECT_PLAN_STATUS.READY,
            plan: this.createPlanLimitedToAlreadySatisfiedPriorityOption(refreshedPlan) || refreshedPlan
        };
    }

    /**
     * @param {AutoSelectPlan} plan
     * @returns {Promise<AutoSelectCycleResult>}
     */
    async tryAutoSelectPlan(plan) {
        for (const priorityOption of plan.priorityOptions) {
            const result = await this.tryPriorityOptionForAction(plan.action, priorityOption, plan.config);
            if (result === PRIORITY_OPTION_ATTEMPT_RESULT.SATISFIED) return AUTO_SELECT_CYCLE_RESULT.CONTINUE;
            if (result === PRIORITY_OPTION_ATTEMPT_RESULT.STOP_CYCLE) return AUTO_SELECT_CYCLE_RESULT.STOP;
        }

        return AUTO_SELECT_CYCLE_RESULT.CONTINUE;
    }

    /**
     * @param {ChampSelectAction} action
     * @param {ChampionPriorityOption} priorityOption
     * @param {AutoSelectConfig} config
     * @returns {Promise<PriorityOptionAttemptResult>}
     */
    async tryPriorityOptionForAction(action, priorityOption, config) {
        if (this.isPriorityOptionAlreadySatisfied(action, priorityOption)) {
            return PRIORITY_OPTION_ATTEMPT_RESULT.SATISFIED;
        }

        if (isBraveryChampionOption(priorityOption)) {
            return this.tryBraveryForAction(action, config);
        }

        const championIds = await this.resolveChampionIdsForPriorityOption(action, priorityOption, config);
        const shouldTryNextRandomCandidateOnFailure = isRandomChampionOption(priorityOption) && !this.isLockingExistingPickIntent(action, championIds);
        for (const championId of championIds) {
            const options = { tryNextRandomCandidateOnFailure: shouldTryNextRandomCandidateOnFailure };
            const result = await this.attemptChampionForAction(action, championId, config, options);
            if (result === ACTION_ATTEMPT_RESULT.SATISFIED) return PRIORITY_OPTION_ATTEMPT_RESULT.SATISFIED;
            if (result === ACTION_ATTEMPT_RESULT.STOP_CYCLE) return PRIORITY_OPTION_ATTEMPT_RESULT.STOP_CYCLE;
        }

        return PRIORITY_OPTION_ATTEMPT_RESULT.TRY_NEXT_PRIORITY_OPTION;
    }

    /**
     * @param {ChampSelectAction} action
     * @param {AutoSelectConfig} config
     * @returns {Promise<PriorityOptionAttemptResult>}
     */
    async tryBraveryForAction(action, config) {
        if (action.type !== "pick") {
            return PRIORITY_OPTION_ATTEMPT_RESULT.TRY_NEXT_PRIORITY_OPTION;
        }

        if (this.isBraveryPickIntentSet(action)) {
            return PRIORITY_OPTION_ATTEMPT_RESULT.SATISFIED;
        }

        console.debug("auto-champion-select: Trying to pick Bravery...");
        const response = await this.selectChampion(action.id, BRAVERY_CHAMPION_ID);
        console.debug(response.ok
            ? "auto-champion-select: Bravery request accepted, refreshing champ select state..."
            : "auto-champion-select: Failed to pick Bravery, refreshing champ select state...");

        const updatedAction = await this.refreshPendingAction(action);
        if (!updatedAction || !this.isActionAvailable(updatedAction, config)) {
            return response.ok
                ? PRIORITY_OPTION_ATTEMPT_RESULT.SATISFIED
                : PRIORITY_OPTION_ATTEMPT_RESULT.STOP_CYCLE;
        }

        if (this.isBraveryPickIntentSet(updatedAction)) {
            return PRIORITY_OPTION_ATTEMPT_RESULT.SATISFIED;
        }

        this.rejectedBraveryActionIds.add(action.id);
        console.debug("auto-champion-select: Bravery was not applied after refresh, trying next pick...");
        return PRIORITY_OPTION_ATTEMPT_RESULT.TRY_NEXT_PRIORITY_OPTION;
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
     * @param {AutoSelectConfig} config
     * @returns {boolean}
     */
    isActionAvailable(action, config) {
        if (action.type === "pick") {
            return action.isInProgress === true || config.pickIntent !== false;
        }

        return action.isInProgress === true;
    }

    /**
     * @param {string} actionType
     * @param {AutoSelectConfigs} configs
     * @returns {AutoSelectConfig | null}
     */
    getConfigForActionType(actionType, configs) {
        if (actionType === "pick") return configs.pickConfig;
        if (actionType === "ban") return configs.banConfig;
        return null;
    }

    /**
     * @param {ChampSelectAction} action
     * @param {AutoSelectConfig} config
     * @returns {AutoSelectPlan | null}
     */
    createAutoSelectPlan(action, config) {
        const priorityOptions = this.getAvailablePriorityOptionsForAction(action, config);
        if (priorityOptions.length === 0) {
            return null;
        }

        return { action, config, priorityOptions };
    }

    /**
     * @param {ChampSelectAction} action
     * @param {AutoSelectConfig} config
     * @returns {ChampionPriorityOption[]}
     */
    getAvailablePriorityOptionsForAction(action, config) {
        return normalizeChampionPriorityOptions(config.priorityOptions || config.champions)
            .filter(priorityOption => !this.isPriorityOptionUnavailableForAction(action, priorityOption, config));
    }

    /**
     * @param {ChampSelectAction} action
     * @param {ChampionPriorityOption} priorityOption
     * @param {AutoSelectConfig} config
     * @returns {boolean}
     */
    isPriorityOptionUnavailableForAction(action, priorityOption, config) {
        if (isRandomChampionOption(priorityOption)) {
            return this.isRandomPriorityOptionUnavailableForAction(action, config);
        }

        if (isBraveryChampionOption(priorityOption)) {
            return action.type !== "pick" || this.rejectedBraveryActionIds.has(action.id);
        }

        return this.isChampionUnavailableForAction(action, priorityOption, config);
    }

    /**
     * @param {ChampSelectAction} action
     * @param {AutoSelectConfig} config
     * @returns {boolean}
     */
    isRandomPriorityOptionUnavailableForAction(action, config) {
        if (action.type !== "pick") {
            return false;
        }

        const randomAssignedPositions = normalizePositionList(config.randomAssignedPositions);
        if (randomAssignedPositions.length === 0) {
            return false;
        }

        if (!this.localPlayerAssignedPosition) {
            console.debug(`auto-champion-select: Skipping random pick because no assigned position is available for ${randomAssignedPositions.join(", ")} restriction.`);
            return true;
        }

        if (!randomAssignedPositions.includes(this.localPlayerAssignedPosition)) {
            console.debug(`auto-champion-select: Skipping random pick because assigned position ${this.localPlayerAssignedPosition} is not in ${randomAssignedPositions.join(", ")}.`);
            return true;
        }

        return false;
    }

    /**
     * @param {AutoSelectPlan} plan
     * @returns {AutoSelectPlan | null}
     */
    createPlanLimitedToAlreadySatisfiedPriorityOption(plan) {
        const alreadySatisfiedPriorityOption = plan.priorityOptions.find(priorityOption =>
            this.isPriorityOptionAlreadySatisfied(plan.action, priorityOption)
        );

        if (alreadySatisfiedPriorityOption === undefined) {
            return null;
        }

        return {
            ...plan,
            priorityOptions: [alreadySatisfiedPriorityOption]
        };
    }

    /**
     * @param {ChampSelectAction} action
     * @param {ChampionPriorityOption} priorityOption
     * @returns {boolean}
     */
    isPriorityOptionAlreadySatisfied(action, priorityOption) {
        if (isRandomChampionOption(priorityOption)) {
            return this.hasAnyPickIntentSet(action);
        }

        if (isBraveryChampionOption(priorityOption)) {
            return this.isBraveryPickIntentSet(action);
        }

        return this.isPickIntentSetToChampion(action, priorityOption);
    }

    /**
     * @param {ChampSelectAction} action
     * @returns {boolean}
     */
    hasAnyPickIntentSet(action) {
        return action.type === "pick" &&
            action.isInProgress !== true &&
            (
                this.localPlayerIntentChampionId !== null ||
                this.localPlayerIntentIsBravery ||
                toChampionId(action.championId) !== null ||
                isBraveryChampionId(action.championId)
            );
    }

    /**
     * @param {ChampSelectAction} action
     * @returns {boolean}
     */
    isBraveryPickIntentSet(action) {
        return action.type === "pick" &&
            action.isInProgress !== true &&
            (
                this.localPlayerIntentIsBravery ||
                isBraveryChampionId(action.championId)
            );
    }

    /**
     * @param {ChampSelectAction} action
     * @param {number[]} championIds
     * @returns {boolean}
     */
    isLockingExistingPickIntent(action, championIds) {
        return action.type === "pick" &&
            action.isInProgress === true &&
            championIds.length === 1 &&
            championIds[0] === this.getPickIntentChampionId(action);
    }

    /**
     * @param {ChampSelectAction} action
     * @returns {number | null}
     */
    getPickIntentChampionId(action) {
        if (action.type !== "pick") {
            return null;
        }

        return toChampionId(action.championId) ?? this.localPlayerIntentChampionId;
    }

    /**
     * @param {ChampSelectAction} action
     * @param {AutoSelectConfig} config
     * @param {ActionDelayConfig} actionDelayConfig
     * @returns {Promise<AutoSelectPlan | null>}
     */
    async delayAndRefreshAutoSelectPlan(action, config, actionDelayConfig) {
        const delayMs = getRandomActionDelayMs(actionDelayConfig);
        if (delayMs <= 0) {
            console.debug(`auto-champion-select: Action delay is instant for ${action.type}.`);
            return this.createAutoSelectPlan(action, config);
        }

        console.debug(`auto-champion-select: Waiting ${delayMs}ms before ${action.type}...`);

        const version = this.watchVersion;
        await sleep(delayMs);

        if (!this.mounted || version !== this.watchVersion) {
            return null;
        }

        let updatedAction = null;
        try {
            await this.refreshSessionState();
            updatedAction = this.findPendingAction(action);
        } catch (error) {
            console.debug("auto-champion-select: Failed to refresh champion select after action delay", error);
            return null;
        }

        const updatedConfig = this.getConfigForActionType(action.type, readAutoSelectConfigs());
        if (!updatedConfig?.enabled) {
            return null;
        }

        if (!updatedAction || !this.isActionAvailable(updatedAction, updatedConfig)) {
            return null;
        }

        return this.createAutoSelectPlan(updatedAction, updatedConfig);
    }

    /**
     * @param {ChampSelectAction} action
     * @param {ChampionPriorityOption} priorityOption
     * @param {AutoSelectConfig} config
     * @returns {Promise<number[]>}
     */
    async resolveChampionIdsForPriorityOption(action, priorityOption, config) {
        if (isBraveryChampionOption(priorityOption)) {
            return [];
        }

        if (!isRandomChampionOption(priorityOption)) {
            return [priorityOption];
        }

        return this.resolveRandomChampionIdsForAction(action, config);
    }

    /**
     * @param {ChampSelectAction} action
     * @param {AutoSelectConfig} config
     * @returns {Promise<number[]>}
     */
    async resolveRandomChampionIdsForAction(action, config) {
        if (action.type === "pick" && action.isInProgress === true) {
            const pickIntentChampionId = this.getPickIntentChampionId(action);
            if (
                pickIntentChampionId !== null &&
                !this.isChampionUnavailableForAction(action, pickIntentChampionId, config)
            ) {
                return [pickIntentChampionId];
            }
        }

        const championIds = await this.fetchRandomCandidateChampionIds(action);
        if (championIds.length === 0) {
            return [];
        }

        const availableChampionIds = championIds.filter(championId => !this.isChampionUnavailableForAction(action, championId, config));

        const resolvedRandomChampionIds = action.type === "pick" && !this.hasConfiguredRandomPoolPositions(config)
            ? await this.preferAssignedPositionRandomPickCandidates(availableChampionIds)
            : await this.filterRandomChampionIdsByConfiguredPoolPositions(availableChampionIds, config);

        return getShuffledChampionIds(resolvedRandomChampionIds);
    }

    /**
     * @param {ChampSelectAction} action
     * @returns {Promise<number[]>}
     */
    async fetchRandomCandidateChampionIds(action) {
        const endpoint = action.type === "pick"
            ? LEAGUE_CLIENT_ENDPOINTS.pickableChampionIds
            : LEAGUE_CLIENT_ENDPOINTS.bannableChampionIds;

        try {
            const response = await request("GET", endpoint);
            if (!response.ok) {
                console.debug(`auto-champion-select: Failed to load random ${action.type} candidates`, response);
                return [];
            }

            const rawCandidateChampionIds = await response.json();
            if (action.type === "ban" && isAnyBannableChampionSentinel(rawCandidateChampionIds)) {
                console.debug("auto-champion-select: Random ban endpoint returned unrestricted sentinel, falling back to all champions...");
                return await this.fetchAllChampionIdsForRandomBan();
            }

            return normalizeChampionIds(rawCandidateChampionIds);
        } catch (error) {
            console.debug(`auto-champion-select: Failed to load random ${action.type} candidates`, error);
            return [];
        }
    }

    /**
     * @returns {Promise<number[]>}
     */
    async fetchAllChampionIdsForRandomBan() {
        const champions = await getAllChampions();
        return champions.map(champion => champion.id);
    }

    /**
     * @param {AutoSelectConfig} config
     * @returns {boolean}
     */
    hasConfiguredRandomPoolPositions(config) {
        return normalizePositionList(config.randomPoolPositions).length > 0;
    }

    /**
     * @param {number[]} championIds
     * @param {AutoSelectConfig} config
     * @returns {Promise<number[]>}
     */
    async filterRandomChampionIdsByConfiguredPoolPositions(championIds, config) {
        const randomPoolPositions = normalizePositionList(config.randomPoolPositions);
        if (randomPoolPositions.length === 0) {
            return championIds;
        }

        const randomPoolPositionSet = new Set(randomPoolPositions);
        const recommendedPositionsByChampionId = await getRecommendedChampionPositionsById();
        const positionFilteredChampionIds = championIds.filter(championId =>
            recommendedPositionsByChampionId[String(championId)]?.some(position => randomPoolPositionSet.has(position))
        );

        if (positionFilteredChampionIds.length === 0) {
            console.debug(`auto-champion-select: No random candidates matched ${randomPoolPositions.join(", ")} restriction.`);
        }

        return positionFilteredChampionIds;
    }

    /**
     * @param {number[]} championIds
     * @returns {Promise<number[]>}
     */
    async preferAssignedPositionRandomPickCandidates(championIds) {
        if (!this.localPlayerAssignedPosition) {
            return championIds;
        }

        const recommendedPositionsByChampionId = await getRecommendedChampionPositionsById();
        const positionFilteredChampionIds = championIds.filter(championId =>
            recommendedPositionsByChampionId[String(championId)]?.includes(this.localPlayerAssignedPosition)
        );

        return positionFilteredChampionIds.length > 0 ? positionFilteredChampionIds : championIds;
    }

    /**
     * @param {ChampSelectAction} action
     * @param {unknown} championId
     * @param {AutoSelectConfig} config
     * @param {{tryNextRandomCandidateOnFailure?: boolean}} [options]
     * @returns {Promise<ActionAttemptResult>}
     */
    async attemptChampionForAction(action, championId, config, options = {}) {
        const normalizedChampionId = toChampionId(championId);
        if (normalizedChampionId === null || this.isChampionUnavailableForAction(action, normalizedChampionId, config)) {
            return ACTION_ATTEMPT_RESULT.TRY_NEXT_CHAMPION;
        }

        if (this.isPickIntentSetToChampion(action, normalizedChampionId)) {
            return ACTION_ATTEMPT_RESULT.SATISFIED;
        }

        console.debug(`auto-champion-select: Trying to ${action.type} ${normalizedChampionId}...`);
        const response = await this.selectChampion(action.id, normalizedChampionId);
        if (response.ok) {
            return ACTION_ATTEMPT_RESULT.SATISFIED;
        }

        console.debug(`auto-champion-select: Failed to ${action.type} ${normalizedChampionId}, refreshing champ select state...`);
        const updatedAction = await this.refreshPendingAction(action);
        if (!updatedAction || !this.isActionAvailable(updatedAction, config)) {
            return ACTION_ATTEMPT_RESULT.STOP_CYCLE;
        }

        if (options.tryNextRandomCandidateOnFailure === true) {
            if (this.hasAnyPickIntentSet(updatedAction)) {
                return ACTION_ATTEMPT_RESULT.SATISFIED;
            }

            console.debug(`auto-champion-select: Failed random ${action.type} candidate ${normalizedChampionId}, trying next ${action.type}...`);
            return ACTION_ATTEMPT_RESULT.TRY_NEXT_CHAMPION;
        }

        if (!this.isChampionUnavailableForAction(updatedAction, normalizedChampionId, config)) {
            return ACTION_ATTEMPT_RESULT.STOP_CYCLE;
        }

        console.debug(`auto-champion-select: ${normalizedChampionId} is unavailable after refresh, trying next ${action.type}...`);
        return ACTION_ATTEMPT_RESULT.TRY_NEXT_CHAMPION;
    }

    /**
     * @param {ChampSelectAction} action
     * @param {number} championId
     * @returns {boolean}
     */
    isPickIntentSetToChampion(action, championId) {
        return action.type === "pick" &&
            action.isInProgress !== true &&
            (this.localPlayerIntentChampionId === championId || toChampionId(action.championId) === championId);
    }

    /**
     * @param {ChampSelectAction} action
     * @returns {Promise<ChampSelectAction | null>}
     */
    async refreshPendingAction(action) {
        try {
            await this.refreshSessionState();
        } catch (error) {
            console.debug("auto-champion-select: Failed to refresh champion select action", error);
            return null;
        }

        return this.findPendingAction(action);
    }

    /**
     * @param {ChampSelectAction} action
     * @returns {ChampSelectAction | null}
     */
    findPendingAction(action) {
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

        if (action.type === "ban" && this.alliedIntentChampionIds.has(championId)) {
            if (config.force === true) {
                console.debug(`auto-champion-select: Banning ${championId} but it has an allied pick intent, forcing...`);
            } else {
                console.debug(`auto-champion-select: Banning ${championId} but it has an allied pick intent, skipping...`);
                return true;
            }
        }

        if (action.type === "pick" && this.teammateIntentChampionIds.has(championId)) {
            if (config.force === true) {
                console.debug(`auto-champion-select: Picking ${championId} but it has a teammate pick intent, forcing...`);
            } else {
                console.debug(`auto-champion-select: Picking ${championId} but it has a teammate pick intent, skipping...`);
                return true;
            }
        }

        if (action.type === "pick" && this.pickedChampionIds.has(championId)) {
            console.debug(`auto-champion-select: Picking ${championId} but it's already picked, skipping...`);
            return true;
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
