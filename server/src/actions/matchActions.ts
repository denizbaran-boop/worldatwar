import { canProduceUnit, findTileByKey, findUnitOnTile, isTileOccupied, rankPlayersByTiles, unlockTechForPlayer } from "../game/actions";
import { chooseAIMove, computeCapitalThreat, evaluateStrategicMode, evaluateDesiredArmySize, shouldBreakPeace, shouldRequestReinforcements, type AIActivityState, type AIStrategicMode } from "../game/ai";
import { canUnitAttackTarget, resolveUnitCombat } from "../game/combatSystem";
import { getDiplomacyPairKey, shouldAcceptPeaceOffer, shouldSendPeaceOffer, updatePeaceMemories } from "../game/diplomacy";
import { applyTurnIncome, calculateTurnIncome } from "../game/economySystem";
import { createInitialFog, discoverTileAndNeighborsOnMap, discoverTileKeys, revealAroundAllUnits } from "../game/fogOfWar";
import { axialDistance, getNeighborKeys } from "../game/map";
import { TECH_BY_ID } from "../game/techTree";
import { UNIT_PROGRESSION, UNIT_STATS } from "../game/unitSystem";
import { claimVillageTerritory } from "../game/villageSystem";
import type { AIDifficulty, DonationEntry, FogOfWarState, LogEntry, PeacePairMemory, PeaceTreaty, Player, PlayerColor, ReinforcementRequest, Tile, TechNodeId, Unit, UnitType } from "../game/types";
import { makeId } from "../game/utils";
import type { GameAction, MatchState } from "../match/matchTypes";
import { fail, ok, type ValidationResult } from "../validation/matchValidation";

export type ActionResult =
  | { ok: true; match: MatchState; actionVisible?: boolean }
  | { ok: false; error: string };

const createLog = (turn: number, text: string, color?: PlayerColor): LogEntry => ({
  id: makeId("log"),
  turn,
  text,
  color
});

const getFactionPairKey = (a: string, b: string) => [a, b].sort().join(":");

const arePeacePartners = (treaties: PeaceTreaty[], a: string, b: string) =>
  treaties.some((t) => (t.playerA === a && t.playerB === b) || (t.playerA === b && t.playerB === a));

// Mutually reveal all owned tiles when a peace treaty is signed
const revealTerritoryOnPeace = (fog: FogOfWarState, tiles: Tile[], playerA: string, playerB: string): FogOfWarState => {
  const aTiles = tiles.filter((t) => t.ownerId === playerA).map((t) => t.key);
  const bTiles = tiles.filter((t) => t.ownerId === playerB).map((t) => t.key);
  let next = fog;
  if (bTiles.length > 0) next = discoverTileKeys(next, playerA, bTiles);
  if (aTiles.length > 0) next = discoverTileKeys(next, playerB, aTiles);
  return next;
};

const recordPeaceOffer = (memories: Record<string, PeacePairMemory>, from: string, to: string, turn: number) => {
  const key = getDiplomacyPairKey(from, to);
  const mem = memories[key];
  if (!mem) return memories;
  return { ...memories, [key]: { ...mem, lastOfferTurn: turn } };
};

const recordPeaceRejection = (memories: Record<string, PeacePairMemory>, from: string, to: string, turn: number) => {
  const key = getDiplomacyPairKey(from, to);
  const mem = memories[key];
  if (!mem) return memories;
  return { ...memories, [key]: { ...mem, lastRejectedTurn: turn } };
};

const recordBrokenPeace = (memories: Record<string, PeacePairMemory>, breaker: string, other: string, turn: number) => {
  const key = getDiplomacyPairKey(breaker, other);
  const mem = memories[key];
  if (!mem) return memories;
  return { ...memories, [key]: { ...mem, lastBrokenTurn: turn, trustPenalty: (mem.trustPenalty ?? 0) + 15 } };
};

const resetMovementForPlayer = (units: Unit[], playerId: string) =>
  units.map((unit) =>
    unit.ownerId === playerId
      ? { ...unit, hasMovedThisTurn: false, hasAttackedThisTurn: false, movesUsed: 0 }
      : unit
  );

const updatePlayerAliveState = (players: Player[], tiles: Tile[], units: Unit[]) =>
  players.map((player) => {
    const ownsTiles = tiles.some((tile) => tile.ownerId === player.id);
    const hasUnits = units.some((unit) => unit.ownerId === player.id);
    return { ...player, isAlive: ownsTiles || hasUnits };
  });

const getAlivePlayers = (players: Player[]) => players.filter((player) => player.isAlive);

const findNextAlivePlayerId = (players: Player[], currentPlayerId: string) => {
  const alive = getAlivePlayers(players);
  if (alive.length === 0) return null;
  const currentIndex = alive.findIndex((player) => player.id === currentPlayerId);
  if (currentIndex === -1) return alive[0].id;
  return alive[(currentIndex + 1) % alive.length]?.id ?? alive[0].id;
};

const eliminateFaction = (
  match: MatchState,
  defeatedPlayerId: string,
  options: { conquerorPlayerId?: string; logText?: string; logColor?: PlayerColor }
): MatchState => {
  const { conquerorPlayerId, logText, logColor } = options;
  const transferTo = conquerorPlayerId ?? null;
  const wasAlive = match.players.find((player) => player.id === defeatedPlayerId)?.isAlive ?? false;

  let nextTiles = match.map.tiles.map((tile) => {
    if (tile.ownerId !== defeatedPlayerId) return tile;
    return {
      ...tile,
      ownerId: transferTo,
      controlledByVillageId: transferTo ? tile.controlledByVillageId : null
    };
  });

  let nextVillages = match.villages.map((village) => {
    if (village.ownerId !== defeatedPlayerId) return village;
    return {
      ...village,
      ownerId: transferTo,
      controlledTileKeys: transferTo ? village.controlledTileKeys : []
    };
  });

  const nextUnits = match.units.filter((unit) => unit.ownerId !== defeatedPlayerId);
  const nextPlayers = match.players.map((player) =>
    player.id === defeatedPlayerId ? { ...player, isAlive: false } : player
  );
  const nextPeaceTreaties = match.peaceTreaties.filter(
    (treaty) => treaty.playerA !== defeatedPlayerId && treaty.playerB !== defeatedPlayerId
  );

  const rr = match.reinforcementRequest;
  const nextReinforcementRequest = rr &&
    (rr.fromPlayerId === defeatedPlayerId || rr.toPlayerId === defeatedPlayerId) ? null : rr;

  if (transferTo === null) {
    const neutralVillageIds = new Set(
      nextVillages.filter((village) => village.ownerId === null).map((village) => village.id)
    );
    nextTiles = nextTiles.map((tile) =>
      tile.controlledByVillageId && neutralVillageIds.has(tile.controlledByVillageId)
        ? { ...tile, controlledByVillageId: null }
        : tile
    );
  }

  const nextCurrentPlayerId =
    match.currentPlayerId === defeatedPlayerId
      ? findNextAlivePlayerId(nextPlayers, defeatedPlayerId) ?? match.currentPlayerId
      : match.currentPlayerId;
  const nextCurrentFaction =
    nextPlayers.find((player) => player.id === nextCurrentPlayerId)?.color ?? match.currentFaction;

  return {
    ...match,
    map: { ...match.map, tiles: nextTiles },
    villages: nextVillages,
    units: nextUnits,
    players: nextPlayers,
    peaceTreaties: nextPeaceTreaties,
    reinforcementRequest: nextReinforcementRequest,
    justBrokePeace: match.justBrokePeace.filter((entry) => entry !== defeatedPlayerId),
    currentPlayerId: nextCurrentPlayerId,
    currentFaction: nextCurrentFaction,
    gameLog:
      wasAlive && logText
        ? [...match.gameLog, createLog(match.turnNumber, logText, logColor)]
        : match.gameLog
  };
};

const getCapitalOwnerIds = (tiles: Tile[]) =>
  Array.from(new Set(tiles.filter((tile) => tile.isCapital && tile.ownerId).map((tile) => tile.ownerId as string)));

const computeVisibleTiles = (players: Player[], units: Unit[], tiles: Tile[]) => {
  const base = createInitialFog(players.map((player) => player.id));
  return revealAroundAllUnits(base, units, tiles, 1);
};

const mergeExplored = (previous: FogOfWarState, visible: FogOfWarState) => {
  const next: FogOfWarState = { ...previous };
  for (const playerId of Object.keys(visible)) {
    next[playerId] = {
      ...(previous[playerId] ?? {}),
      ...(visible[playerId] ?? {})
    };
  }
  return next;
};

const clearFirstContactNotifications = (match: MatchState): MatchState => ({
  ...match,
  firstContactNotificationByPlayer: Object.fromEntries(
    match.players.map((player) => [player.id, null])
  )
});

const syncContacts = (tiles: Tile[], existing: string[]) => {
  const known = new Set(existing);
  const byKey = new Map(tiles.map((tile) => [tile.key, tile]));
  for (const tile of tiles) {
    if (!tile.ownerId) continue;
    for (const key of getNeighborKeys(tile)) {
      const neighbor = byKey.get(key);
      if (!neighbor?.ownerId || neighbor.ownerId === tile.ownerId) continue;
      known.add(getFactionPairKey(tile.ownerId, neighbor.ownerId));
    }
  }
  return Array.from(known);
};

const buildKnownContacts = (
  playerId: string,
  knownBefore: string[],
  tiles: Tile[],
  units: Unit[],
  explored: Record<string, boolean>
) => {
  const known = new Set(knownBefore);
  const newlyDiscovered: string[] = [];

  const register = (ownerId: string) => {
    if (ownerId === playerId || known.has(ownerId)) return;
    known.add(ownerId);
    newlyDiscovered.push(ownerId);
  };

  for (const tile of tiles) {
    if (!explored[tile.key] || !tile.ownerId) continue;
    register(tile.ownerId);
  }

  for (const unit of units) {
    if (!explored[unit.tileKey]) continue;
    register(unit.ownerId);
  }

  return {
    known: Array.from(known),
    newlyDiscovered
  };
};

const finalizeMatchState = (match: MatchState): MatchState => {
  const visibleTiles = computeVisibleTiles(match.players, match.units, match.map.tiles);
  const exploredTiles = mergeExplored(match.exploredTiles, visibleTiles);
  const players = updatePlayerAliveState(match.players, match.map.tiles, match.units);
  const alivePlayers = getAlivePlayers(players);
  const contactedPlayerIdsByPlayer: Record<string, string[]> = {};
  const firstContactNotificationByPlayer: Record<string, PlayerColor | null> = {};

  for (const player of players) {
    const explored = exploredTiles[player.id] ?? {};
    const prevKnown = match.contactedPlayerIdsByPlayer[player.id] ?? [];
    const { known, newlyDiscovered } = buildKnownContacts(
      player.id,
      prevKnown,
      match.map.tiles,
      match.units,
      explored
    );
    contactedPlayerIdsByPlayer[player.id] = known;
    const firstNew = newlyDiscovered[0] ?? null;
    firstContactNotificationByPlayer[player.id] = firstNew
      ? (players.find((entry) => entry.id === firstNew)?.color ?? null)
      : (match.firstContactNotificationByPlayer[player.id] ?? null);
  }
  const capitalOwners = getCapitalOwnerIds(match.map.tiles);
  const winnerByAlive = alivePlayers.length === 1 ? alivePlayers[0].id : null;
  const winnerByCapitals = capitalOwners.length === 1 ? capitalOwners[0] : null;
  const winnerId = winnerByAlive ?? winnerByCapitals ?? null;
  const winnerPlayer = winnerId ? players.find((player) => player.id === winnerId) ?? null : null;
  const gameOver = alivePlayers.length <= 1 || Boolean(winnerId);
  const gameOverReason = winnerPlayer
    ? winnerByAlive
      ? `${winnerPlayer.color} is the last remaining commander.`
      : `${winnerPlayer.color} controls all capitals.`
    : alivePlayers.length === 0
      ? "All factions eliminated."
      : match.gameOverReason;
  const settledCurrentPlayerId =
    players.some((player) => player.id === match.currentPlayerId && player.isAlive)
      ? match.currentPlayerId
      : findNextAlivePlayerId(players, match.currentPlayerId) ?? match.currentPlayerId;
  const settledCurrentFaction =
    players.find((player) => player.id === settledCurrentPlayerId)?.color ?? match.currentFaction;
  let pendingPeaceTreaty = match.pendingPeaceTreaty;
  if (pendingPeaceTreaty) {
    const activeOffer = pendingPeaceTreaty;
    const fromAlive = players.some((player) => player.id === activeOffer.fromPlayerId && player.isAlive);
    const toAlive = players.some((player) => player.id === activeOffer.toPlayerId && player.isAlive);
    const alreadyAtPeace = arePeacePartners(
      match.peaceTreaties,
      activeOffer.fromPlayerId,
      activeOffer.toPlayerId
    );
    if (!fromAlive || !toAlive || alreadyAtPeace) {
      pendingPeaceTreaty = null;
    }
  }

  return {
    ...match,
    players,
    currentPlayerId: settledCurrentPlayerId,
    currentFaction: settledCurrentFaction,
    exploredTiles,
    visibleTiles,
    fogOfWar: exploredTiles,
    factionContactPairs: syncContacts(match.map.tiles, match.factionContactPairs),
    contactedPlayerIdsByPlayer,
    firstContactNotificationByPlayer,
    contactedPlayerIds: match.contactedPlayerIds,
    firstContactNotification: match.firstContactNotification,
    outgoingTreaty: null,
    pendingPeaceTreaty,
    pendingTreatyResult: null,
    gameOver,
    phase: gameOver ? "finished" : match.phase,
    gameOverReason,
    ranking: rankPlayersByTiles(match.map.tiles, players),
    winner: winnerPlayer
      ? {
          playerId: winnerPlayer.id,
          color: winnerPlayer.color,
          reason: "all_capitals"
        }
      : null
  };
};

const requireTurnAction = (match: MatchState, actingPlayerId: string): ValidationResult => {
  if (match.phase !== "in_game") return fail("match_not_in_game");
  if (match.gameOver) return fail("match_finished");
  if (match.currentPlayerId !== actingPlayerId) return fail("not_your_turn");
  return ok();
};

const applyUnitAction = (match: MatchState, actingPlayerId: string, unitId: string, targetTileKey: string): ActionResult => {
  const unit = match.units.find((entry) => entry.id === unitId);
  if (!unit || unit.ownerId !== actingPlayerId) return { ok: false, error: "invalid_unit" };
  if (match.justBrokePeace.length > 0) return { ok: false, error: "end_turn_required_after_break_peace" };

  const sourceTile = findTileByKey(match.map.tiles, unit.tileKey);
  const targetTile = findTileByKey(match.map.tiles, targetTileKey);
  if (!sourceTile || !targetTile) return { ok: false, error: "invalid_tile" };

  const distance = axialDistance(sourceTile, targetTile);
  const stats = UNIT_STATS[unit.type];
  const occupant = findUnitOnTile(match.units, targetTile.key);

  if (occupant && occupant.ownerId === actingPlayerId) {
    return { ok: false, error: "target_occupied_by_friendly" };
  }

  const isAirUnit = stats.domain === "air";
  const movesUsed = unit.movesUsed ?? 0;
  const effectiveMovementRange = isAirUnit ? stats.movementRange - movesUsed : stats.movementRange;

  const isEnemyOccupied = Boolean(occupant && occupant.ownerId !== actingPlayerId);
  const isRangedAttack = Boolean(isEnemyOccupied && distance > effectiveMovementRange && distance <= stats.attackRange);
  const movingIntoPeaceTerritory =
    targetTile.ownerId !== null && arePeacePartners(match.peaceTreaties, actingPlayerId, targetTile.ownerId);

  if (unit.hasMovedThisTurn) return { ok: false, error: "unit_already_acted" };
  if (isEnemyOccupied && unit.hasAttackedThisTurn) return { ok: false, error: "unit_already_attacked" };
  if (!isEnemyOccupied && isAirUnit && movesUsed > 0 && !unit.hasAttackedThisTurn) {
    return { ok: false, error: "must_attack_before_second_move" };
  }

  if (!isRangedAttack && distance > effectiveMovementRange) {
    return { ok: false, error: "invalid_move_range" };
  }

  if (isEnemyOccupied && distance > stats.attackRange) {
    return { ok: false, error: "invalid_attack_range" };
  }

  let nextTiles = [...match.map.tiles];
  let nextUnits = [...match.units];
  let nextVillages = [...match.villages];
  let nextLastCombatTurnByPair = { ...match.lastCombatTurnByPair };
  let nextLogs = [...match.gameLog];
  let capturedCapitalOwnerId: string | null = null;

  const actorColor = match.players.find((player) => player.id === actingPlayerId)?.color;

  if (occupant && occupant.ownerId !== actingPlayerId) {
    if (arePeacePartners(match.peaceTreaties, actingPlayerId, occupant.ownerId)) {
      return { ok: false, error: "cannot_attack_peace_partner" };
    }
    if (!canUnitAttackTarget(unit, occupant)) {
      return { ok: false, error: "invalid_attack_domain" };
    }

    const pairKey = getFactionPairKey(actingPlayerId, occupant.ownerId);
    nextLastCombatTurnByPair[pairKey] = match.turnNumber;

    const combat = resolveUnitCombat(unit, occupant);
    const movesRemaining = isAirUnit ? stats.movementRange - movesUsed : 0;
    const doneAfterAttack = !isAirUnit || movesRemaining <= 0;
    nextUnits = nextUnits.map((entry) =>
      entry.id === unit.id
        ? { ...entry, hasMovedThisTurn: doneAfterAttack, hasAttackedThisTurn: true }
        : entry
    );

    if (combat.defenderDestroyed) {
      const advancing = !isRangedAttack && stats.domain !== "air";
      nextUnits = nextUnits
        .filter((entry) => entry.id !== occupant.id)
        .map((entry) =>
          entry.id === unit.id && advancing
            ? { ...entry, tileKey: targetTile.key }
            : entry
        );

      if (advancing) {
        nextTiles = nextTiles.map((tile) =>
          tile.key === targetTile.key ? { ...tile, ownerId: actingPlayerId } : tile
        );
        if (targetTile.isCapital && targetTile.ownerId && targetTile.ownerId !== actingPlayerId) {
          capturedCapitalOwnerId = targetTile.ownerId;
        }

        const village = nextVillages.find((entry) => entry.tileKey === targetTile.key);
        if (village) {
          const claimed = claimVillageTerritory(nextTiles, nextVillages, village.id, actingPlayerId);
          nextTiles = claimed.tiles;
          nextVillages = claimed.villages;
          if (claimed.changed) {
            nextLogs.push(createLog(match.turnNumber, "City captured", actorColor));
          }
        }
      }

      nextLogs.push(createLog(match.turnNumber, `${UNIT_STATS[unit.type].name} destroyed ${UNIT_STATS[occupant.type].name}`, actorColor));
    } else {
      nextUnits = nextUnits.map((entry) =>
        entry.id === occupant.id ? { ...entry, health: combat.defenderHealthAfter } : entry
      );
      nextLogs.push(createLog(match.turnNumber, `${UNIT_STATS[unit.type].name} hit ${UNIT_STATS[occupant.type].name}`, actorColor));
    }
  } else {
    if (stats.domain === "air" && (targetTile.isCapital || targetTile.villageId !== null)) {
      return { ok: false, error: "air_cannot_land_on_city" };
    }

    const airDoneAfterMove = isAirUnit && unit.hasAttackedThisTurn;
    nextUnits = nextUnits.map((entry) =>
      entry.id === unit.id
        ? {
            ...entry,
            tileKey: targetTile.key,
            hasMovedThisTurn: !isAirUnit || airDoneAfterMove,
            movesUsed: movesUsed + distance
          }
        : entry
    );

    if (!movingIntoPeaceTerritory && stats.domain !== "air") {
      nextTiles = nextTiles.map((tile) =>
        tile.key === targetTile.key ? { ...tile, ownerId: actingPlayerId } : tile
      );
      if (targetTile.isCapital && targetTile.ownerId && targetTile.ownerId !== actingPlayerId) {
        capturedCapitalOwnerId = targetTile.ownerId;
      }
    }

    const village = nextVillages.find((entry) => entry.tileKey === targetTile.key);
    if (village && village.ownerId !== actingPlayerId && !movingIntoPeaceTerritory) {
      const claimed = claimVillageTerritory(nextTiles, nextVillages, village.id, actingPlayerId);
      nextTiles = claimed.tiles;
      nextVillages = claimed.villages;
      if (claimed.changed) {
        nextLogs.push(createLog(match.turnNumber, "City captured", actorColor));
      }
    }

    nextLogs.push(createLog(match.turnNumber, `${UNIT_STATS[unit.type].name} moved`, actorColor));
  }

  const tileKeySet = new Set(nextTiles.map((tile) => tile.key));
  let nextExplored = match.exploredTiles;
  const movedUnit = nextUnits.find((entry) => entry.id === unit.id);
  if (movedUnit) {
    const movedTile = nextTiles.find((tile) => tile.key === movedUnit.tileKey);
    if (movedTile) {
      nextExplored = discoverTileAndNeighborsOnMap(nextExplored, actingPlayerId, movedTile, tileKeySet);
    }
  }

  let next = {
    ...match,
    map: { ...match.map, tiles: nextTiles },
    villages: nextVillages,
    units: nextUnits,
    exploredTiles: nextExplored,
    fogOfWar: nextExplored,
    lastCombatTurnByPair: nextLastCombatTurnByPair,
    gameLog: nextLogs
  };

  if (capturedCapitalOwnerId && !movingIntoPeaceTerritory) {
    const defeatedColor = match.players.find((player) => player.id === capturedCapitalOwnerId)?.color ?? capturedCapitalOwnerId;
    next = eliminateFaction(next, capturedCapitalOwnerId, {
      conquerorPlayerId: actingPlayerId,
      logText: `${defeatedColor} was eliminated after capital capture`,
      logColor: actorColor
    });
  }

  next = finalizeMatchState(next);

  return { ok: true, match: next };
};

const applyProduceUnit = (match: MatchState, actingPlayerId: string, unitType: UnitType, tileKey: string): ActionResult => {
  const player = match.players.find((entry) => entry.id === actingPlayerId);
  if (!player) return { ok: false, error: "player_not_found" };

  const tile = findTileByKey(match.map.tiles, tileKey);
  if (!tile) return { ok: false, error: "invalid_tile" };
  if (tile.ownerId !== actingPlayerId) return { ok: false, error: "production_not_owned_tile" };
  if (!tile.isCapital && tile.villageId === null) return { ok: false, error: "production_not_city" };
  if (isTileOccupied(match.units, tileKey)) return { ok: false, error: "production_tile_occupied" };
  if (!canProduceUnit(player, unitType)) return { ok: false, error: "tech_locked" };

  const cost = UNIT_STATS[unitType].productionCost;
  if (player.gold < cost) return { ok: false, error: "insufficient_gold" };

  const nextPlayers = match.players.map((entry) =>
    entry.id === actingPlayerId ? { ...entry, gold: entry.gold - cost } : entry
  );

  const nextUnits = [
    ...match.units,
    {
      id: makeId("unit"),
      ownerId: actingPlayerId,
      tileKey,
      type: unitType,
      health: UNIT_STATS[unitType].maxHealth,
      hasMovedThisTurn: true,
      hasAttackedThisTurn: false,
      movesUsed: 0
    }
  ];

  const actorColor = match.players.find((entry) => entry.id === actingPlayerId)?.color;
  const next = finalizeMatchState({
    ...match,
    players: nextPlayers,
    units: nextUnits,
    gameLog: [...match.gameLog, createLog(match.turnNumber, `Produced ${UNIT_STATS[unitType].name}`, actorColor)]
  });

  return { ok: true, match: next };
};

const applyUnlockTech = (match: MatchState, actingPlayerId: string, techId: string): ActionResult => {
  const unlocked = unlockTechForPlayer(match.players, actingPlayerId, techId as never);
  if (!unlocked.ok) return { ok: false, error: unlocked.error };

  const actorColor = match.players.find((entry) => entry.id === actingPlayerId)?.color;
  const next = {
    ...match,
    players: unlocked.players,
    gameLog: [...match.gameLog, createLog(match.turnNumber, `Unlocked tech`, actorColor)]
  };

  return { ok: true, match: finalizeMatchState(next) };
};

const applyHealUnit = (match: MatchState, actingPlayerId: string, unitId: string): ActionResult => {
  const unit = match.units.find((entry) => entry.id === unitId);
  if (!unit || unit.ownerId !== actingPlayerId) return { ok: false, error: "invalid_unit" };
  if (unit.hasMovedThisTurn) return { ok: false, error: "unit_already_acted" };

  const max = UNIT_STATS[unit.type].maxHealth;
  if (unit.health >= max) return { ok: false, error: "unit_full_health" };

  const actorColor = match.players.find((entry) => entry.id === actingPlayerId)?.color;
  const next = finalizeMatchState({
    ...match,
    units: match.units.map((entry) =>
      entry.id === unitId ? { ...entry, health: Math.min(max, entry.health + 1), hasMovedThisTurn: true } : entry
    ),
    gameLog: [...match.gameLog, createLog(match.turnNumber, `${UNIT_STATS[unit.type].name} healed`, actorColor)]
  });

  return { ok: true, match: next };
};

const applySendPeace = (match: MatchState, actingPlayerId: string, toPlayerId: string): ActionResult => {
  if (actingPlayerId === toPlayerId) return { ok: false, error: "invalid_peace_target" };
  if (match.pendingPeaceTreaty) return { ok: false, error: "peace_offer_pending" };
  if (!match.players.some((entry) => entry.id === actingPlayerId && entry.isAlive)) return { ok: false, error: "player_not_found" };
  if (!match.players.some((entry) => entry.id === toPlayerId && entry.isAlive)) return { ok: false, error: "invalid_peace_target" };
  const contacted = match.contactedPlayerIdsByPlayer[actingPlayerId] ?? [];
  if (!contacted.includes(toPlayerId)) return { ok: false, error: "faction_not_discovered" };
  if (arePeacePartners(match.peaceTreaties, actingPlayerId, toPlayerId)) return { ok: false, error: "already_at_peace" };

  // Enforce the same cooldowns that the client UI enforces
  const mem = match.peaceMemories[getDiplomacyPairKey(actingPlayerId, toPlayerId)];
  if (mem) {
    if (mem.lastOfferTurn !== null && match.turnNumber - mem.lastOfferTurn < 4) return { ok: false, error: "peace_offer_cooldown" };
    if (mem.lastRejectedTurn !== null && match.turnNumber - mem.lastRejectedTurn < 6) return { ok: false, error: "peace_offer_cooldown" };
    if (mem.lastBrokenTurn !== null && match.turnNumber - mem.lastBrokenTurn < 10) return { ok: false, error: "peace_offer_cooldown" };
  }

  const fromColor = match.players.find((entry) => entry.id === actingPlayerId)?.color;
  const toColor = match.players.find((entry) => entry.id === toPlayerId)?.color;
  if (!fromColor || !toColor) return { ok: false, error: "invalid_peace_target" };

  return {
    ok: true,
    match: {
      ...match,
      pendingPeaceTreaty: {
        fromPlayerId: actingPlayerId,
        toPlayerId,
        fromColor,
        toColor,
        reason: "Strategic ceasefire proposal",
        score: 0,
        turnSent: match.turnNumber,
        direction: "human_outgoing"
      },
      peaceMemories: recordPeaceOffer(match.peaceMemories, actingPlayerId, toPlayerId, match.turnNumber),
      gameLog: [...match.gameLog, createLog(match.turnNumber, `${fromColor} proposed peace to ${toColor}`, fromColor)],
      diplomacyLog: [...match.diplomacyLog, createLog(match.turnNumber, `${fromColor} proposed peace to ${toColor}`, fromColor)]
    }
  };
};

const applyRespondPeace = (match: MatchState, actingPlayerId: string, accept: boolean): ActionResult => {
  const offer = match.pendingPeaceTreaty;
  if (!offer || offer.toPlayerId !== actingPlayerId) return { ok: false, error: "no_pending_peace_offer" };
  if (!match.players.some((entry) => entry.id === offer.fromPlayerId && entry.isAlive)) {
    return { ok: false, error: "peace_offer_sender_unavailable" };
  }

  const fromColor = offer.fromColor;
  const toColor = offer.toColor;
  const hasTreaty = arePeacePartners(match.peaceTreaties, offer.fromPlayerId, offer.toPlayerId);
  const nextPeaceTreaties =
    accept && !hasTreaty
      ? [...match.peaceTreaties, { playerA: offer.fromPlayerId, playerB: offer.toPlayerId }]
      : match.peaceTreaties;
  const outcomeText = accept
    ? `${toColor} accepted peace with ${fromColor}`
    : `${toColor} rejected peace from ${fromColor}`;

  const nextMemories = accept
    ? match.peaceMemories
    : recordPeaceRejection(match.peaceMemories, offer.fromPlayerId, offer.toPlayerId, match.turnNumber);

  const nextExploredTiles = accept && !hasTreaty
    ? revealTerritoryOnPeace(match.exploredTiles, match.map.tiles, offer.fromPlayerId, offer.toPlayerId)
    : match.exploredTiles;

  return {
    ok: true,
    match: {
      ...match,
      peaceTreaties: nextPeaceTreaties,
      peaceMemories: nextMemories,
      exploredTiles: nextExploredTiles,
      fogOfWar: nextExploredTiles,
      outgoingTreaty: null,
      pendingPeaceTreaty: null,
      pendingTreatyResult: null,
      gameLog: [
        ...match.gameLog,
        createLog(match.turnNumber, outcomeText, toColor)
      ],
      diplomacyLog: [...match.diplomacyLog, createLog(match.turnNumber, outcomeText, toColor)]
    }
  };
};

const applyBreakPeace = (match: MatchState, actingPlayerId: string, toPlayerId: string): ActionResult => {
  const actorColor = match.players.find((entry) => entry.id === actingPlayerId)?.color;
  const partnerColor = match.players.find((entry) => entry.id === toPlayerId)?.color;
  if (!actorColor || !partnerColor) return { ok: false, error: "invalid_peace_target" };

  const nextTreaties = match.peaceTreaties.filter(
    (entry) => !((entry.playerA === actingPlayerId && entry.playerB === toPlayerId) || (entry.playerA === toPlayerId && entry.playerB === actingPlayerId))
  );

  // Evict the breaker's units that are standing on the partner's territory
  const partnerTileKeys = new Set(match.map.tiles.filter((t) => t.ownerId === toPlayerId).map((t) => t.key));
  const nextUnits = match.units.filter((u) => !(u.ownerId === actingPlayerId && partnerTileKeys.has(u.tileKey)));

  // Cancel any active reinforcement request between these two players
  const rr = match.reinforcementRequest;
  const nextRR = rr &&
    ((rr.fromPlayerId === actingPlayerId || rr.fromPlayerId === toPlayerId) &&
     (rr.toPlayerId === actingPlayerId || rr.toPlayerId === toPlayerId))
    ? null : rr;

  return {
    ok: true,
    match: {
      ...match,
      peaceTreaties: nextTreaties,
      peaceMemories: recordBrokenPeace(match.peaceMemories, actingPlayerId, toPlayerId, match.turnNumber),
      units: nextUnits,
      reinforcementRequest: nextRR,
      justBrokePeace: [...match.justBrokePeace, toPlayerId],
      gameLog: [...match.gameLog, createLog(match.turnNumber, `${actorColor} broke peace with ${partnerColor}`, actorColor)]
    }
  };
};

const findDonationSpawnTiles = (receiverId: string, tiles: Tile[], units: Unit[], count: number): string[] => {
  const capitalTile = tiles.find((t) => t.isCapital && t.ownerId === receiverId);
  const occupied = new Set(units.map((u) => u.tileKey));
  return tiles
    .filter((t) => t.ownerId === receiverId && !occupied.has(t.key))
    .sort((a, b) => {
      if (!capitalTile) return 0;
      return axialDistance(a, capitalTile) - axialDistance(b, capitalTile);
    })
    .slice(0, count)
    .map((t) => t.key);
};

const applySurrender = (match: MatchState, actingPlayerId: string): ActionResult => {
  const surrenderingPlayer = match.players.find((player) => player.id === actingPlayerId);
  if (!surrenderingPlayer) return { ok: false, error: "player_not_found" };
  if (!surrenderingPlayer.isAlive) return { ok: false, error: "player_already_eliminated" };

  const next = finalizeMatchState(
    eliminateFaction(match, actingPlayerId, {
      logText: `${surrenderingPlayer.color} surrendered`,
      logColor: surrenderingPlayer.color
    })
  );

  return { ok: true, match: next };
};

const applyEndTurn = (match: MatchState): ActionResult => {
  const alivePlayers = match.players.filter((player) => player.isAlive);
  if (alivePlayers.length === 0) return { ok: false, error: "no_alive_players" };

  const currentIndex = alivePlayers.findIndex((player) => player.id === match.currentPlayerId);
  const nextIndex = (currentIndex + 1) % alivePlayers.length;
  const nextPlayerId = alivePlayers[nextIndex]?.id;
  if (!nextPlayerId) return { ok: false, error: "next_player_not_found" };

  const nextTurn = nextIndex === 0 ? match.turnNumber + 1 : match.turnNumber;

  const regenUnits = match.units.map((unit) => {
    if (unit.ownerId !== match.currentPlayerId) return unit;
    if (unit.hasMovedThisTurn || unit.hasAttackedThisTurn) return unit;
    const max = UNIT_STATS[unit.type].maxHealth;
    if (unit.health >= max) return unit;
    return { ...unit, health: unit.health + 1 };
  });

  const income = calculateTurnIncome(nextPlayerId, match.map.tiles, match.villages);
  const playersWithIncome = applyTurnIncome(match.players, nextPlayerId, income.income);
  const refreshedUnits = resetMovementForPlayer(regenUnits, nextPlayerId);
  const nextColor = playersWithIncome.find((entry) => entry.id === nextPlayerId)?.color;

  const pending = match.pendingPeaceTreaty;
  const autoRejectPending = Boolean(pending && pending.toPlayerId === match.currentPlayerId);
  const autoRejectText = autoRejectPending
    ? `${pending?.toColor ?? match.currentFaction} rejected peace from ${pending?.fromColor ?? "unknown"}`
    : null;

  // Reinforcement: auto-reject if donor ends turn mid-donation; clear on requester's next turn
  const rr = match.reinforcementRequest;
  let nextReinforcementRequest = match.reinforcementRequest;
  const extraLogs: LogEntry[] = [];
  if (rr) {
    if (rr.status === "donating" && rr.toPlayerId === match.currentPlayerId) {
      // Donor ended turn without submitting → auto-reject
      nextReinforcementRequest = { ...rr, status: "rejected", turnResolved: match.turnNumber };
      extraLogs.push(createLog(match.turnNumber, `${rr.toColor} did not send reinforcements (timed out)`, rr.toColor));
    } else if ((rr.status === "accepted" || rr.status === "rejected") && rr.fromPlayerId === nextPlayerId) {
      // Requester's turn is next → clear the request so client can detect and show notification
      nextReinforcementRequest = null;
    }
  }

  // Update peace memories with current tile/unit/village counts every turn
  // so "recent losses" and "stalled front" evaluations have fresh data
  const updatedPeaceMemories = updatePeaceMemories(
    autoRejectPending
      ? recordPeaceRejection(match.peaceMemories, pending!.fromPlayerId, pending!.toPlayerId, match.turnNumber)
      : match.peaceMemories,
    match.players,
    match.map.tiles,
    match.units,
    match.villages,
    nextTurn
  );

  const next = finalizeMatchState({
    ...match,
    turnNumber: nextTurn,
    currentPlayerId: nextPlayerId,
    currentFaction: nextColor ?? match.currentFaction,
    players: playersWithIncome,
    units: refreshedUnits,
    peaceMemories: updatedPeaceMemories,
    outgoingTreaty: null,
    pendingPeaceTreaty: autoRejectPending ? null : match.pendingPeaceTreaty,
    pendingTreatyResult: null,
    justBrokePeace: [],
    reinforcementRequest: nextReinforcementRequest,
    gameLog: [
      ...match.gameLog,
      ...extraLogs,
      ...(autoRejectText ? [createLog(match.turnNumber, autoRejectText, pending?.toColor)] : []),
      createLog(nextTurn, `${nextColor ?? nextPlayerId} ended turn`, nextColor)
    ],
    diplomacyLog: autoRejectText
      ? [...match.diplomacyLog, createLog(match.turnNumber, autoRejectText, pending?.toColor)]
      : match.diplomacyLog
  });

  return { ok: true, match: next };
};

// ── AI helper: score a tech node by the combat value of the unit it unlocks ──
const scoreTechNode = (tech: { cost: number; unlockedUnitType: string | null }, difficulty: AIDifficulty): number => {
  if (!tech.unlockedUnitType) return tech.cost; // no unit unlocked — fall back to raw cost
  const stats = UNIT_STATS[tech.unlockedUnitType as UnitType];
  if (!stats) return tech.cost;
  // Weighted combat value: damage, health, range, and mobility all matter
  let score = stats.damage * 22 + stats.maxHealth * 14 + stats.attackRange * 18 + stats.movementRange * 6;
  // Hard AI gets extra incentive to rush the tank upgrade path (strongest ground unit)
  if (difficulty === "hard") {
    const TANK_PATH: UnitType[] = ["strong_soldier", "machine_gunner", "mortar", "tank"];
    const pathIndex = TANK_PATH.indexOf(stats.type);
    if (pathIndex >= 0) {
      // Deeper nodes on the path get a larger bonus (tank gets +120, mortar +80, etc.)
      score += 30 + pathIndex * 30;
    }
  }
  return score;
};

// ── AI helper: pick the best affordable tech node with all prerequisites met ──
const pickBestAvailableTechForAI = (player: { gold: number; unlockedTechIds: TechNodeId[] }, difficulty: AIDifficulty = "normal") => {
  // Hard AI is willing to spend down to near-zero gold on a key tech unlock;
  // easier difficulties keep a larger reserve so they can still produce units.
  const minGoldReserve = difficulty === "hard" ? 15 : difficulty === "normal" ? 25 : UNIT_STATS.basic_soldier.productionCost;
  const available = Object.values(TECH_BY_ID).filter((tech) => {
    if (player.unlockedTechIds.includes(tech.id as TechNodeId)) return false;
    if (!tech.prerequisites.every((prereq) => player.unlockedTechIds.includes(prereq as TechNodeId))) return false;
    return player.gold - tech.cost >= minGoldReserve;
  });
  if (available.length === 0) return null;
  return available.sort((a, b) => scoreTechNode(b, difficulty) - scoreTechNode(a, difficulty))[0]!;
};

// ── AI helper: try to unlock the best available tech node ────────────────────
const maybeUnlockTechForAI = (match: MatchState, aiPlayerId: string): MatchState => {
  const aiPlayer = match.players.find((p) => p.id === aiPlayerId);
  if (!aiPlayer) return match;
  // Gold reserve is encoded inside pickBestAvailableTechForAI per difficulty
  const tech = pickBestAvailableTechForAI(aiPlayer, match.aiDifficulty);
  if (!tech) return match;
  const result = applyUnlockTech(match, aiPlayerId, tech.id);
  return result.ok ? result.match : match;
};

// ── AI helper: should this AI donate when asked for reinforcements? ───────────
const evaluateAIDonationDecision = (
  aiId: string,
  requesterId: string,
  tiles: Tile[],
  units: Unit[],
  players: { id: string; gold: number }[],
  difficulty: AIDifficulty
): boolean => {
  const aiPlayer = players.find((p) => p.id === aiId);
  if (!aiPlayer || aiPlayer.gold < UNIT_STATS.basic_soldier.productionCost) return false;

  const aiCapital = tiles.find((t) => t.isCapital && (t as Tile).ownerId === aiId);
  const tileMap = new Map(tiles.map((t) => [t.key, t]));
  const aiEnemyUnits = units.filter((u) => u.ownerId !== aiId && u.ownerId !== requesterId);

  let selfThreat = 0;
  if (aiCapital) {
    for (const enemy of aiEnemyUnits) {
      const et = tileMap.get(enemy.tileKey);
      if (!et) continue;
      const dist = axialDistance(aiCapital, et);
      if (dist <= 3) selfThreat += (4 - dist);
    }
  }
  if (selfThreat >= 5) return false;

  const aiUnitCount = units.filter((u) => u.ownerId === aiId).length;
  const requesterUnitCount = units.filter((u) => u.ownerId === requesterId).length;

  let score = -10;
  if (requesterUnitCount <= 2) score += 25;
  else if (requesterUnitCount <= 4) score += 10;
  if (aiPlayer.gold >= 100) score += 20;
  else if (aiPlayer.gold >= 60) score += 10;
  if (aiUnitCount >= 6) score += 15;
  if (selfThreat === 0) score += 10;
  score += difficulty === "easy" ? -15 : difficulty === "normal" ? 0 : 10;

  return score >= 15;
};

// ── AI helper: pick affordable units to donate ───────────────────────────────
const MAX_AI_DONATION_UNITS = 5;

const pickAIDonationUnits = (aiPlayer: { gold: number; unlockedTechIds: TechNodeId[] }, difficulty: AIDifficulty): DonationEntry[] => {
  const budget = Math.floor(aiPlayer.gold * (difficulty === "hard" ? 0.45 : difficulty === "normal" ? 0.35 : 0.25));
  if (budget < UNIT_STATS.basic_soldier.productionCost) return [];

  const DONATION_PREFERENCE: UnitType[] = ["basic_soldier", "strong_soldier", "warrior", "machine_gunner"];
  for (const unitType of DONATION_PREFERENCE) {
    if (unitType !== "basic_soldier") {
      const unlocked = aiPlayer.unlockedTechIds.some(
        (techId) => TECH_BY_ID[techId]?.unlockedUnitType === unitType
      );
      if (!unlocked) continue;
    }
    const cost = UNIT_STATS[unitType].productionCost;
    if (budget < cost) continue;
    const maxByBudget = Math.floor(budget / cost);
    const qty = Math.min(maxByBudget, MAX_AI_DONATION_UNITS, difficulty === "hard" ? 3 : 2);
    if (qty <= 0) continue;
    return [{ unitType, quantity: qty }];
  }
  return [];
};

// ── AI helper: handle a pending reinforcement request directed at this AI ─────
const maybeHandleReinforcementForAI = (match: MatchState, aiPlayerId: string): MatchState => {
  const rr = match.reinforcementRequest;
  if (!rr || rr.status !== "pending" || rr.toPlayerId !== aiPlayerId) return match;

  const aiPlayer = match.players.find((p) => p.id === aiPlayerId);
  if (!aiPlayer) return match;

  const shouldDonate = evaluateAIDonationDecision(
    aiPlayerId, rr.fromPlayerId, match.map.tiles, match.units, match.players, match.aiDifficulty
  );

  if (!shouldDonate) {
    return {
      ...match,
      reinforcementRequest: { ...rr, status: "rejected", turnResolved: match.turnNumber },
      gameLog: [...match.gameLog, createLog(match.turnNumber, `${rr.toColor} declined to send reinforcements`, rr.toColor)]
    };
  }

  const donationEntries = pickAIDonationUnits(aiPlayer, match.aiDifficulty);
  if (donationEntries.length === 0) {
    return {
      ...match,
      reinforcementRequest: { ...rr, status: "rejected", turnResolved: match.turnNumber },
      gameLog: [...match.gameLog, createLog(match.turnNumber, `${rr.toColor} had nothing to send`, rr.toColor)]
    };
  }

  const totalCost = donationEntries.reduce((sum, e) => sum + UNIT_STATS[e.unitType].productionCost * e.quantity, 0);
  const unitTypeList: UnitType[] = donationEntries.flatMap((e) => Array<UnitType>(e.quantity).fill(e.unitType));
  const spawnTileKeys = findDonationSpawnTiles(rr.fromPlayerId, match.map.tiles, match.units, unitTypeList.length);
  const donorColor = aiPlayer.color;
  const newUnits: Unit[] = spawnTileKeys.map((tileKey, i) => ({
    id: makeId("unit"),
    ownerId: rr.fromPlayerId,
    tileKey,
    type: unitTypeList[i]!,
    health: UNIT_STATS[unitTypeList[i]!].maxHealth,
    hasMovedThisTurn: true,
    hasAttackedThisTurn: false,
    movesUsed: 0
  }));
  const nextPlayers = match.players.map((p) => p.id === aiPlayerId ? { ...p, gold: p.gold - totalCost } : p);
  const actualCount = newUnits.length;

  return {
    ...match,
    players: nextPlayers,
    units: [...match.units, ...newUnits],
    unitDonorColors: { ...match.unitDonorColors, ...Object.fromEntries(newUnits.map((u) => [u.id, donorColor])) },
    reinforcementRequest: { ...rr, status: "accepted", donatedEntries: donationEntries, totalGoldCost: totalCost, turnResolved: match.turnNumber },
    gameLog: [...match.gameLog, createLog(match.turnNumber, `${donorColor} sent ${actualCount} unit${actualCount !== 1 ? "s" : ""} to ${rr.fromColor}`, donorColor)]
  };
};

// ── AI helper: choose which unit type to produce (composition-aware) ─────────
const chooseAIUnitTypeToProduce = (
  player: { gold: number; unlockedTechIds: TechNodeId[] },
  difficulty: AIDifficulty,
  ownedUnits: Unit[],
  capitalThreat: number,
  strategicMode: AIStrategicMode
): UnitType | null => {
  const unlocked = (UNIT_PROGRESSION as UnitType[]).filter((unitType) => {
    if (unitType === "basic_soldier") return true;
    return player.unlockedTechIds.some((techId) => TECH_BY_ID[techId]?.unlockedUnitType === unitType);
  }).filter((unitType) => player.gold >= UNIT_STATS[unitType].productionCost);

  if (unlocked.length === 0) return null;

  const totalArmy = ownedUnits.length;
  const frontlineTypes: UnitType[] = ["tank", "warrior", "strong_soldier"];
  const frontlineCount = ownedUnits.filter((u) => frontlineTypes.includes(u.type)).length;
  const patriotCount = ownedUnits.filter((u) => u.type === "patriot").length;
  // Hard AI builds a more offensive army (65% frontline, 25% defensive)
  const frontlineRatio = difficulty === "hard" ? 0.65 : 0.55;
  const patriotRatio = difficulty === "hard" ? 0.25 : 0.35;
  const targetFrontline = Math.max(1, Math.round(totalArmy * frontlineRatio));
  const targetPatriot = totalArmy > 2 ? Math.round(totalArmy * patriotRatio) : 0;

  // Emergency: protect capital when heavily threatened
  if (capitalThreat > 3 && unlocked.includes("patriot") && patriotCount < totalArmy * 0.5) return "patriot";
  // Hard AI: always build tanks once minimum patriot coverage is in place
  if (difficulty === "hard" && unlocked.includes("tank") &&
      (patriotCount >= Math.floor(totalArmy * 0.2) || !unlocked.includes("patriot"))) return "tank";
  // Normal/easy: produce tank only when flush with gold
  if (player.gold >= UNIT_STATS.tank.productionCost * 2 && unlocked.includes("tank")) return "tank";
  if (patriotCount < targetPatriot && unlocked.includes("patriot")) return "patriot";
  if (frontlineCount < targetFrontline) {
    for (const type of ["tank", "warrior", "strong_soldier"] as UnitType[]) {
      if (unlocked.includes(type)) return type;
    }
  }
  if ((strategicMode === "Defense" || strategicMode === "Desperation") && unlocked.includes("patriot")) return "patriot";
  // Hard AI fallback: prefer tanks over random expensive units (e.g. aircraft)
  if (difficulty === "hard" && unlocked.includes("tank")) return "tank";
  if (difficulty === "easy") return unlocked.sort((a, b) => UNIT_STATS[a].productionCost - UNIT_STATS[b].productionCost)[0]!;
  return unlocked.sort((a, b) => UNIT_STATS[b].productionCost - UNIT_STATS[a].productionCost)[0]!;
};

// ── AI helper: choose spawn tile strategically ────────────────────────────────
const chooseAISpawnTile = (
  tiles: Tile[],
  units: Unit[],
  aiPlayerId: string,
  discovered: Record<string, boolean>,
  unitType: UnitType
): Tile | null => {
  const enemyUnits = units.filter((u) => u.ownerId !== aiPlayerId && discovered[u.tileKey]);
  const candidates = tiles.filter(
    (tile) => tile.ownerId === aiPlayerId && (tile.isCapital || tile.villageId !== null) && !isTileOccupied(units, tile.key)
  );
  if (candidates.length === 0) return null;

  const capitalTile = tiles.find((t) => t.ownerId === aiPlayerId && t.isCapital);
  const isDefensive = unitType === "patriot";

  const scoreTile = (tile: Tile) => {
    let score = 0;
    if (isDefensive) {
      if (tile.isCapital) score += 30;
      if (capitalTile) score += Math.max(0, 20 - axialDistance(tile, capitalTile) * 5);
    } else {
      if (tile.villageId) score += 12;
      if (tile.hasGoldMine) score += 9;
      if (tile.isCapital) score += 5;
      const nearestEnemyDist = enemyUnits.length
        ? Math.min(...enemyUnits.map((enemy) => {
            const et = tiles.find((t) => t.key === enemy.tileKey);
            return et ? axialDistance(tile, et) : Number.POSITIVE_INFINITY;
          }))
        : Number.POSITIVE_INFINITY;
      if (nearestEnemyDist <= 2) score += 20;
      else if (nearestEnemyDist <= 4) score += 12;
      else if (nearestEnemyDist <= 6) score += 6;
    }
    return score;
  };

  return candidates.sort((a, b) => scoreTile(b) - scoreTile(a))[0] ?? null;
};

// ── AI helper: produce one unit with composition-aware type + strategic spawn ─
const maybeProduceForAI = (match: MatchState, aiPlayerId: string, strategicMode: AIStrategicMode): MatchState => {
  const aiPlayer = match.players.find((entry) => entry.id === aiPlayerId);
  if (!aiPlayer) return match;

  const ownedUnits = match.units.filter((u) => u.ownerId === aiPlayerId);
  const discovered = match.exploredTiles[aiPlayerId] ?? {};
  const capitalTile = match.map.tiles.find((t) => t.ownerId === aiPlayerId && t.isCapital);
  const tileMap = new Map(match.map.tiles.map((t) => [t.key, t]));
  const enemyUnits = match.units.filter((u) => u.ownerId !== aiPlayerId && discovered[u.tileKey]);
  const capitalThreat = capitalTile ? computeCapitalThreat(capitalTile, enemyUnits, tileMap) : 0;

  const type = chooseAIUnitTypeToProduce(aiPlayer, match.aiDifficulty, ownedUnits, capitalThreat, strategicMode);
  if (!type) return match;

  const spawnTile = chooseAISpawnTile(match.map.tiles, match.units, aiPlayerId, discovered, type);
  if (!spawnTile) return match;

  const produced = applyProduceUnit(match, aiPlayerId, type, spawnTile.key);
  return produced.ok ? produced.match : match;
};

// ── Default activity state used when per-player tracking isn't available ─────
const DEFAULT_AI_ACTIVITY: AIActivityState = {
  turnsWithoutProduction: 0,
  turnsWithoutExploration: 0,
  turnsBoxedIn: 0,
  turnsBelowTargetArmy: 0,
  lastStrategicMode: null
};

const REINFORCEMENT_COOLDOWN_TURNS = 4;

export const runAISteps = (input: MatchState): MatchState => {
  let match = input;
  let safety = 0;

  while (!match.gameOver && match.aiPlayerIds.includes(match.currentPlayerId) && safety < 60) {
    const aiPlayerId = match.currentPlayerId;

    // ── 1. Compute strategic mode for this turn ──────────────────────────────
    const aiSnapshot = {
      playerId: aiPlayerId,
      players: match.players,
      tiles: match.map.tiles,
      units: match.units,
      villages: match.villages,
      discovered: match.exploredTiles[aiPlayerId] ?? {},
      difficulty: match.aiDifficulty,
      mapSize: match.map.mapSize,
      peaceTreaties: match.peaceTreaties
    };
    const strategicMode = evaluateStrategicMode(aiSnapshot, DEFAULT_AI_ACTIVITY);
    const desiredArmy = evaluateDesiredArmySize(aiSnapshot, strategicMode, DEFAULT_AI_ACTIVITY);
    const currentArmy = match.units.filter((u) => u.ownerId === aiPlayerId).length;

    // ── 2. Respond to reinforcement request if AI is the donor ───────────────
    match = maybeHandleReinforcementForAI(match, aiPlayerId);
    if (match.gameOver) break;

    // ── 3. Request reinforcements if desperate and ally available ────────────
    if (!match.reinforcementRequest) {
      const reqEval = shouldRequestReinforcements(aiSnapshot, DEFAULT_AI_ACTIVITY);
      if (reqEval.shouldRequest) {
        const aiPlayer = match.players.find((p) => p.id === aiPlayerId);
        const allies = match.peaceTreaties
          .filter((t) => t.playerA === aiPlayerId || t.playerB === aiPlayerId)
          .map((t) => (t.playerA === aiPlayerId ? t.playerB : t.playerA))
          .filter((allyId) => match.factionContactPairs.includes(getFactionPairKey(aiPlayerId, allyId)))
          .map((allyId) => match.players.find((p) => p.id === allyId))
          .filter((p): p is NonNullable<typeof p> => Boolean(p))
          .sort((a, b) =>
            match.units.filter((u) => u.ownerId === b.id).length -
            match.units.filter((u) => u.ownerId === a.id).length
          );
        for (const ally of allies) {
          const cooldownKey = getFactionPairKey(aiPlayerId, ally.id);
          const lastRequest = match.reinforcementCooldowns[cooldownKey] ?? 0;
          if (match.turnNumber - lastRequest < REINFORCEMENT_COOLDOWN_TURNS) continue;
          match = {
            ...match,
            reinforcementRequest: {
              id: makeId("rr"),
              fromPlayerId: aiPlayerId,
              fromColor: aiPlayer?.color ?? "blue",
              toPlayerId: ally.id,
              toColor: ally.color,
              turnSent: match.turnNumber,
              status: "pending",
              donatedEntries: [],
              totalGoldCost: 0,
              turnResolved: null
            },
            reinforcementCooldowns: { ...match.reinforcementCooldowns, [cooldownKey]: match.turnNumber },
            diplomacyLog: [...match.diplomacyLog, createLog(match.turnNumber, `${aiPlayer?.color ?? "blue"} requested reinforcements from ${ally.color}`, aiPlayer?.color)]
          };
          break;
        }
      }
    }

    // ── 4. Strategic betrayal: break peace when boxed-in or opportunistic ────
    if (strategicMode === "Preparation" || strategicMode === "War") {
      for (const treaty of match.peaceTreaties) {
        const targetId = treaty.playerA === aiPlayerId ? treaty.playerB : treaty.playerA;
        if (treaty.playerA !== aiPlayerId && treaty.playerB !== aiPlayerId) continue;
        const trustPenalty = match.peaceMemories[getDiplomacyPairKey(aiPlayerId, targetId)]?.trustPenalty ?? 0;
        const breakEval = shouldBreakPeace(
          { ...aiSnapshot, tiles: match.map.tiles, units: match.units },
          targetId,
          DEFAULT_AI_ACTIVITY,
          trustPenalty
        );
        if (breakEval.shouldBreak) {
          const broken = applyBreakPeace(match, aiPlayerId, targetId);
          if (broken.ok) match = broken.match;
          break; // one betrayal per turn
        }
      }
    }

    // ── 5. Proactive peace proposal to known enemies ─────────────────────────
    if (!match.pendingPeaceTreaty) {
      const knownEnemies = match.players.filter((p) =>
        p.isAlive &&
        p.id !== aiPlayerId &&
        !arePeacePartners(match.peaceTreaties, aiPlayerId, p.id) &&
        match.factionContactPairs.includes(getFactionPairKey(aiPlayerId, p.id))
      );
      for (const enemy of knownEnemies) {
        const pairKey = getDiplomacyPairKey(aiPlayerId, enemy.id);
        const mem = match.peaceMemories[pairKey];
        // Respect cooldowns before proposing
        if (mem) {
          if (mem.lastOfferTurn !== null && match.turnNumber - mem.lastOfferTurn < 4) continue;
          if (mem.lastRejectedTurn !== null && match.turnNumber - mem.lastRejectedTurn < 6) continue;
          if (mem.lastBrokenTurn !== null && match.turnNumber - mem.lastBrokenTurn < 10) continue;
        }
        const peaceEval = shouldSendPeaceOffer({
          selfId: aiPlayerId,
          targetId: enemy.id,
          players: match.players,
          tiles: match.map.tiles,
          units: match.units,
          villages: match.villages,
          peaceTreaties: match.peaceTreaties,
          memories: match.peaceMemories,
          turnNumber: match.turnNumber
        });
        if (!peaceEval.shouldSend) continue;

        const fromColor = match.players.find((p) => p.id === aiPlayerId)?.color;
        const toColor = enemy.color;
        if (!fromColor) continue;

        // If target is also AI, resolve immediately; otherwise leave pending for human
        if (match.aiPlayerIds.includes(enemy.id)) {
          const resolution = shouldAcceptPeaceOffer({
            selfId: enemy.id,
            targetId: aiPlayerId,
            players: match.players,
            tiles: match.map.tiles,
            units: match.units,
            villages: match.villages,
            peaceTreaties: match.peaceTreaties,
            memories: match.peaceMemories,
            turnNumber: match.turnNumber
          });
          const updatedMemories = resolution.accepted
            ? recordPeaceOffer(match.peaceMemories, aiPlayerId, enemy.id, match.turnNumber)
            : recordPeaceRejection(
                recordPeaceOffer(match.peaceMemories, aiPlayerId, enemy.id, match.turnNumber),
                aiPlayerId, enemy.id, match.turnNumber
              );
          const outcomeText = resolution.accepted
            ? `${fromColor} and ${toColor} agreed to a peace treaty`
            : `${toColor} refused ${fromColor}'s peace offer`;
          const nextExploredAfterPeace = resolution.accepted
            ? revealTerritoryOnPeace(match.exploredTiles, match.map.tiles, aiPlayerId, enemy.id)
            : match.exploredTiles;
          match = {
            ...match,
            peaceTreaties: resolution.accepted
              ? [...match.peaceTreaties, { playerA: aiPlayerId, playerB: enemy.id }]
              : match.peaceTreaties,
            exploredTiles: nextExploredAfterPeace,
            fogOfWar: nextExploredAfterPeace,
            peaceMemories: updatedMemories,
            gameLog: [...match.gameLog, createLog(match.turnNumber, outcomeText, resolution.accepted ? fromColor : toColor)],
            diplomacyLog: [...match.diplomacyLog, createLog(match.turnNumber, outcomeText, resolution.accepted ? fromColor : toColor)]
          };
        } else {
          // Target is a human — set pending treaty for them to respond
          match = {
            ...match,
            pendingPeaceTreaty: {
              fromPlayerId: aiPlayerId,
              toPlayerId: enemy.id,
              fromColor,
              toColor,
              reason: peaceEval.evaluation.primaryReason,
              score: peaceEval.evaluation.score,
              turnSent: match.turnNumber,
              direction: "ai_outgoing"
            },
            peaceMemories: recordPeaceOffer(match.peaceMemories, aiPlayerId, enemy.id, match.turnNumber),
            gameLog: [...match.gameLog, createLog(match.turnNumber, `${fromColor} proposes peace to ${toColor}`, fromColor)],
            diplomacyLog: [...match.diplomacyLog, createLog(match.turnNumber, `${fromColor} proposes peace to ${toColor}`, fromColor)]
          };
        }
        break; // one proposal per turn
      }
    }

    // ── 6. Unlock tech (hard: up to 3 nodes per turn; others: up to 2) ───────
    const maxTechUnlocks = match.aiDifficulty === "hard" ? 3 : 2;
    for (let t = 0; t < maxTechUnlocks; t += 1) {
      const prev = match;
      match = maybeUnlockTechForAI(match, aiPlayerId);
      if (match === prev) break;
    }

    // ── 7. Produce units until army target is reached or gold runs out ───────
    // Hard AI always attempts at least 4 productions to avoid hoarding gold.
    const hardBonus = match.aiDifficulty === "hard" ? 3 : 0;
    const maxProductions = Math.max(1 + hardBonus, desiredArmy - currentArmy + 1 + hardBonus);
    for (let p = 0; p < maxProductions; p += 1) {
      const prev = match;
      match = maybeProduceForAI(match, aiPlayerId, strategicMode);
      if (match === prev) break;
    }

    // ── 8. Move / attack with all available units ────────────────────────────
    const unitCap = Math.max(12, match.units.filter((u) => u.ownerId === aiPlayerId).length * 2);
    let moveCount = 0;
    while (moveCount < unitCap) {
      const choice = chooseAIMove({
        ...aiSnapshot,
        tiles: match.map.tiles,
        units: match.units,
        discovered: match.exploredTiles[aiPlayerId] ?? {},
        strategicMode
      });
      if (!choice) break;
      const result = applyUnitAction(match, aiPlayerId, choice.unitId, choice.targetTileKey);
      moveCount += 1;
      if (!result.ok) break;
      match = result.match;
      if (match.gameOver) break;
    }

    // ── 9. Heal unacted wounded units ────────────────────────────────────────
    for (const unit of match.units) {
      if (unit.ownerId !== aiPlayerId) continue;
      if (unit.hasMovedThisTurn) continue;
      if (unit.health >= UNIT_STATS[unit.type].maxHealth) continue;
      const healed = applyHealUnit(match, aiPlayerId, unit.id);
      if (healed.ok) match = healed.match;
    }

    // ── 10. Handle incoming peace offer ─────────────────────────────────────
    const pendingOffer = match.pendingPeaceTreaty;
    if (pendingOffer && pendingOffer.toPlayerId === aiPlayerId) {
      const resolution = shouldAcceptPeaceOffer({
        selfId: aiPlayerId,
        targetId: pendingOffer.fromPlayerId,
        players: match.players,
        tiles: match.map.tiles,
        units: match.units,
        villages: match.villages,
        peaceTreaties: match.peaceTreaties,
        memories: match.peaceMemories,
        turnNumber: match.turnNumber
      });
      const responded = applyRespondPeace(match, aiPlayerId, resolution.accepted);
      if (responded.ok) match = responded.match;
    }

    const ended = applyEndTurn(match);
    if (!ended.ok) break;
    match = ended.match;
    safety += 1;
  }

  return match;
};

export const applyGameAction = (match: MatchState, actingPlayerId: string, action: GameAction): ActionResult => {
  const matchForAction = clearFirstContactNotifications(match);

  if (action.type === "surrender") {
    const result = applySurrender(matchForAction, actingPlayerId);
    if (!result.ok) return result;
    return { ok: true, match: runAISteps(finalizeMatchState(result.match)) };
  }

  if (action.type === "respond_peace") {
    const result = applyRespondPeace(matchForAction, actingPlayerId, action.accept);
    if (!result.ok) return result;
    return { ok: true, match: runAISteps(finalizeMatchState(result.match)) };
  }

  const turnCheck = requireTurnAction(matchForAction, actingPlayerId);
  if (!turnCheck.ok) return { ok: false, error: turnCheck.error };

  let result: ActionResult;

  switch (action.type) {
    case "unit_action":
      result = applyUnitAction(matchForAction, actingPlayerId, action.unitId, action.targetTileKey);
      break;
    case "produce_unit":
      result = applyProduceUnit(matchForAction, actingPlayerId, action.unitType, action.tileKey);
      break;
    case "unlock_tech":
      result = applyUnlockTech(matchForAction, actingPlayerId, action.techId);
      break;
    case "heal_unit":
      result = applyHealUnit(matchForAction, actingPlayerId, action.unitId);
      break;
    case "send_peace":
      result = applySendPeace(matchForAction, actingPlayerId, action.toPlayerId);
      break;
    case "send_reinforcement": {
      const contacted = matchForAction.contactedPlayerIdsByPlayer[actingPlayerId] ?? [];
      if (!contacted.includes(action.toPlayerId)) {
        result = { ok: false, error: "faction_not_discovered" };
        break;
      }
      if (!arePeacePartners(matchForAction.peaceTreaties, actingPlayerId, action.toPlayerId)) {
        result = { ok: false, error: "not_peace_partners" };
        break;
      }
      if (matchForAction.reinforcementRequest) {
        result = { ok: false, error: "reinforcement_request_pending" };
        break;
      }
      const fromColor = matchForAction.players.find((p) => p.id === actingPlayerId)?.color;
      const toColor = matchForAction.players.find((p) => p.id === action.toPlayerId)?.color;
      if (!fromColor || !toColor) { result = { ok: false, error: "invalid_target" }; break; }
      const newRR: ReinforcementRequest = {
        id: makeId("reinf"),
        fromPlayerId: actingPlayerId,
        fromColor,
        toPlayerId: action.toPlayerId,
        toColor,
        turnSent: matchForAction.turnNumber,
        status: "pending",
        donatedEntries: [],
        totalGoldCost: 0,
        turnResolved: null
      };
      result = {
        ok: true,
        match: {
          ...matchForAction,
          reinforcementRequest: newRR,
          gameLog: [...matchForAction.gameLog, createLog(matchForAction.turnNumber, `${fromColor} requested reinforcements from ${toColor}`, fromColor)],
          diplomacyLog: [...matchForAction.diplomacyLog, createLog(matchForAction.turnNumber, `${fromColor} requested reinforcements from ${toColor}`, fromColor)]
        }
      };
      break;
    }
    case "respond_reinforcement": {
      const rr = matchForAction.reinforcementRequest;
      if (!rr || rr.toPlayerId !== actingPlayerId || rr.status !== "pending") {
        result = { ok: false, error: "no_pending_reinforcement_request" };
        break;
      }
      const actorColor = matchForAction.players.find((p) => p.id === actingPlayerId)?.color;
      if (action.accept) {
        result = {
          ok: true,
          match: {
            ...matchForAction,
            reinforcementRequest: { ...rr, status: "donating" },
            gameLog: [...matchForAction.gameLog, createLog(matchForAction.turnNumber, `${actorColor} agreed to send reinforcements`, actorColor)],
            diplomacyLog: [...matchForAction.diplomacyLog, createLog(matchForAction.turnNumber, `${actorColor} agreed to send reinforcements`, actorColor)]
          }
        };
      } else {
        result = {
          ok: true,
          match: {
            ...matchForAction,
            reinforcementRequest: { ...rr, status: "rejected", turnResolved: matchForAction.turnNumber },
            gameLog: [...matchForAction.gameLog, createLog(matchForAction.turnNumber, `${actorColor} declined reinforcement request`, actorColor)],
            diplomacyLog: [...matchForAction.diplomacyLog, createLog(matchForAction.turnNumber, `${actorColor} declined reinforcement request`, actorColor)]
          }
        };
      }
      break;
    }
    case "submit_donation": {
      const rr = matchForAction.reinforcementRequest;
      if (!rr || rr.toPlayerId !== actingPlayerId || rr.status !== "donating") {
        result = { ok: false, error: "no_active_donation" };
        break;
      }
      const donor = matchForAction.players.find((p) => p.id === actingPlayerId);
      if (!donor) { result = { ok: false, error: "player_not_found" }; break; }
      // Validate each donated unit type is actually unlocked by the donor
      const invalidEntry = action.entries.find((e) => !canProduceUnit(donor, e.unitType));
      if (invalidEntry) { result = { ok: false, error: "tech_locked" }; break; }
      const totalCost = action.entries.reduce((sum, e) => sum + UNIT_STATS[e.unitType].productionCost * e.quantity, 0);
      if (donor.gold < totalCost) { result = { ok: false, error: "insufficient_gold" }; break; }
      const unitTypeList: UnitType[] = action.entries.flatMap((e) => Array<UnitType>(e.quantity).fill(e.unitType));
      const spawnTileKeys = findDonationSpawnTiles(rr.fromPlayerId, matchForAction.map.tiles, matchForAction.units, unitTypeList.length);
      const newUnits: Unit[] = spawnTileKeys.map((tileKey, i) => ({
        id: makeId("unit"),
        ownerId: rr.fromPlayerId,
        tileKey,
        type: unitTypeList[i]!,
        health: UNIT_STATS[unitTypeList[i]!].maxHealth,
        hasMovedThisTurn: true,
        hasAttackedThisTurn: false,
        movesUsed: 0
      }));
      const actualCount = newUnits.length;
      const donorColor = donor.color;
      const receiverColor = rr.fromColor;
      const nextPlayers = matchForAction.players.map((p) => p.id === actingPlayerId ? { ...p, gold: p.gold - totalCost } : p);
      const nextUnits = [...matchForAction.units, ...newUnits];
      const nextUnitDonorColors = { ...matchForAction.unitDonorColors, ...Object.fromEntries(newUnits.map((u) => [u.id, donorColor])) };
      result = {
        ok: true,
        match: {
          ...matchForAction,
          players: nextPlayers,
          units: nextUnits,
          unitDonorColors: nextUnitDonorColors,
          reinforcementRequest: { ...rr, status: "accepted", donatedEntries: action.entries, totalGoldCost: totalCost, turnResolved: matchForAction.turnNumber },
          gameLog: [...matchForAction.gameLog, createLog(matchForAction.turnNumber, `${donorColor} sent ${actualCount} unit${actualCount !== 1 ? "s" : ""} to ${receiverColor}`, donorColor)],
          diplomacyLog: [...matchForAction.diplomacyLog, createLog(matchForAction.turnNumber, `${donorColor} sent ${actualCount} unit${actualCount !== 1 ? "s" : ""} to ${receiverColor}`, donorColor)]
        }
      };
      break;
    }
    case "break_peace":
      result = applyBreakPeace(matchForAction, actingPlayerId, action.toPlayerId);
      break;
    case "end_turn":
      result = applyEndTurn(matchForAction);
      break;
    default:
      result = { ok: false, error: "unsupported_action" };
      break;
  }

  if (!result.ok) return result;
  return { ok: true, match: runAISteps(finalizeMatchState(result.match)) };
};
