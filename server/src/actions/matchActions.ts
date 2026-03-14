import { canProduceUnit, findTileByKey, findUnitOnTile, isTileOccupied, rankPlayersByTiles, unlockTechForPlayer } from "../game/actions";
import { chooseAIMove } from "../game/ai";
import { canUnitAttackTarget, resolveUnitCombat } from "../game/combatSystem";
import { applyTurnIncome, calculateTurnIncome } from "../game/economySystem";
import { createInitialFog, discoverTileAndNeighborsOnMap, revealAroundAllUnits } from "../game/fogOfWar";
import { axialDistance, getNeighborKeys } from "../game/map";
import { UNIT_PROGRESSION, UNIT_STATS } from "../game/unitSystem";
import { claimVillageTerritory } from "../game/villageSystem";
import type { FogOfWarState, LogEntry, PeaceTreaty, Player, PlayerColor, Tile, Unit, UnitType } from "../game/types";
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

const finalizeMatchState = (match: MatchState): MatchState => {
  const visibleTiles = computeVisibleTiles(match.players, match.units, match.map.tiles);
  const exploredTiles = mergeExplored(match.exploredTiles, visibleTiles);
  const players = updatePlayerAliveState(match.players, match.map.tiles, match.units);
  const alivePlayers = getAlivePlayers(players);
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

  return {
    ...match,
    players,
    currentPlayerId: settledCurrentPlayerId,
    currentFaction: settledCurrentFaction,
    exploredTiles,
    visibleTiles,
    fogOfWar: exploredTiles,
    factionContactPairs: syncContacts(match.map.tiles, match.factionContactPairs),
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
  if (unit.hasMovedThisTurn) return { ok: false, error: "unit_already_acted" };
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

  const isEnemyOccupied = Boolean(occupant && occupant.ownerId !== actingPlayerId);
  const isRangedAttack = Boolean(isEnemyOccupied && distance > stats.movementRange && distance <= stats.attackRange);
  const movingIntoPeaceTerritory =
    targetTile.ownerId !== null && arePeacePartners(match.peaceTreaties, actingPlayerId, targetTile.ownerId);

  if (!isRangedAttack && distance > stats.movementRange) {
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
    nextUnits = nextUnits.map((entry) =>
      entry.id === unit.id
        ? { ...entry, hasMovedThisTurn: true, hasAttackedThisTurn: true }
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

    nextUnits = nextUnits.map((entry) =>
      entry.id === unit.id
        ? {
            ...entry,
            tileKey: targetTile.key,
            hasMovedThisTurn: true,
            movesUsed: (entry.movesUsed ?? 0) + distance
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
  if (arePeacePartners(match.peaceTreaties, actingPlayerId, toPlayerId)) return { ok: false, error: "already_at_peace" };

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
      gameLog: [...match.gameLog, createLog(match.turnNumber, `${fromColor} proposed peace to ${toColor}`, fromColor)]
    }
  };
};

const applyRespondPeace = (match: MatchState, actingPlayerId: string, accept: boolean): ActionResult => {
  const offer = match.pendingPeaceTreaty;
  if (!offer || offer.toPlayerId !== actingPlayerId) return { ok: false, error: "no_pending_peace_offer" };

  const fromColor = offer.fromColor;
  const toColor = offer.toColor;

  return {
    ok: true,
    match: {
      ...match,
      peaceTreaties: accept ? [...match.peaceTreaties, { playerA: offer.fromPlayerId, playerB: offer.toPlayerId }] : match.peaceTreaties,
      pendingPeaceTreaty: null,
      gameLog: [
        ...match.gameLog,
        createLog(
          match.turnNumber,
          accept
            ? `${toColor} accepted peace with ${fromColor}`
            : `${toColor} rejected peace from ${fromColor}`,
          toColor
        )
      ]
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

  return {
    ok: true,
    match: {
      ...match,
      peaceTreaties: nextTreaties,
      justBrokePeace: [...match.justBrokePeace, toPlayerId],
      gameLog: [...match.gameLog, createLog(match.turnNumber, `${actorColor} broke peace with ${partnerColor}`, actorColor)]
    }
  };
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

  const next = finalizeMatchState({
    ...match,
    turnNumber: nextTurn,
    currentPlayerId: nextPlayerId,
    currentFaction: nextColor ?? match.currentFaction,
    players: playersWithIncome,
    units: refreshedUnits,
    justBrokePeace: [],
    gameLog: [...match.gameLog, createLog(nextTurn, `${nextColor ?? nextPlayerId} ended turn`, nextColor)]
  });

  return { ok: true, match: next };
};

const maybeProduceForAI = (match: MatchState, aiPlayerId: string): MatchState => {
  const aiPlayer = match.players.find((entry) => entry.id === aiPlayerId);
  if (!aiPlayer) return match;

  const type = [...UNIT_PROGRESSION]
    .reverse()
    .find((entry) => canProduceUnit(aiPlayer, entry) && aiPlayer.gold >= UNIT_STATS[entry].productionCost);

  if (!type) return match;

  const spawnTile = match.map.tiles.find(
    (tile) => tile.ownerId === aiPlayerId && (tile.isCapital || tile.villageId !== null) && !isTileOccupied(match.units, tile.key)
  );

  if (!spawnTile) return match;

  const produced = applyProduceUnit(match, aiPlayerId, type, spawnTile.key);
  return produced.ok ? produced.match : match;
};

export const runAISteps = (input: MatchState): MatchState => {
  let match = input;
  let safety = 0;

  while (!match.gameOver && match.aiPlayerIds.includes(match.currentPlayerId) && safety < 60) {
    const aiPlayerId = match.currentPlayerId;
    match = maybeProduceForAI(match, aiPlayerId);

    for (let i = 0; i < 3; i += 1) {
      const choice = chooseAIMove({
        playerId: aiPlayerId,
        players: match.players,
        tiles: match.map.tiles,
        units: match.units,
        villages: match.villages,
        discovered: match.exploredTiles[aiPlayerId] ?? {},
        difficulty: match.aiDifficulty,
        mapSize: match.map.mapSize,
        peaceTreaties: match.peaceTreaties
      });

      if (!choice) break;
      const result = applyUnitAction(match, aiPlayerId, choice.unitId, choice.targetTileKey);
      if (!result.ok) break;
      match = result.match;
      if (match.gameOver) break;
    }

    const ended = applyEndTurn(match);
    if (!ended.ok) break;
    match = ended.match;
    safety += 1;
  }

  return match;
};

export const applyGameAction = (match: MatchState, actingPlayerId: string, action: GameAction): ActionResult => {
  if (action.type === "surrender") {
    const result = applySurrender(match, actingPlayerId);
    if (!result.ok) return result;
    return { ok: true, match: runAISteps(finalizeMatchState(result.match)) };
  }

  const turnCheck = requireTurnAction(match, actingPlayerId);
  if (!turnCheck.ok) return { ok: false, error: turnCheck.error };

  let result: ActionResult;

  switch (action.type) {
    case "unit_action":
      result = applyUnitAction(match, actingPlayerId, action.unitId, action.targetTileKey);
      break;
    case "produce_unit":
      result = applyProduceUnit(match, actingPlayerId, action.unitType, action.tileKey);
      break;
    case "unlock_tech":
      result = applyUnlockTech(match, actingPlayerId, action.techId);
      break;
    case "heal_unit":
      result = applyHealUnit(match, actingPlayerId, action.unitId);
      break;
    case "send_peace":
      result = applySendPeace(match, actingPlayerId, action.toPlayerId);
      break;
    case "respond_peace":
      result = applyRespondPeace(match, actingPlayerId, action.accept);
      break;
    case "send_reinforcement":
      result = { ok: true, match: { ...match, gameLog: [...match.gameLog, createLog(match.turnNumber, "Reinforcement request sent")] } };
      break;
    case "respond_reinforcement":
      result = { ok: true, match: { ...match, gameLog: [...match.gameLog, createLog(match.turnNumber, action.accept ? "Reinforcement accepted" : "Reinforcement rejected")] } };
      break;
    case "submit_donation":
      result = { ok: true, match: { ...match, gameLog: [...match.gameLog, createLog(match.turnNumber, "Donation submitted")] } };
      break;
    case "break_peace":
      result = applyBreakPeace(match, actingPlayerId, action.toPlayerId);
      break;
    case "end_turn":
      result = applyEndTurn(match);
      break;
    default:
      result = { ok: false, error: "unsupported_action" };
      break;
  }

  if (!result.ok) return result;
  return { ok: true, match: runAISteps(finalizeMatchState(result.match)) };
};
