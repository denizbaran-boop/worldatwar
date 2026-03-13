import { create } from "zustand";
import { PLAYER_COLORS } from "@/lib/game/constants";
import {
  canProduceUnit,
  countOwnedTiles,
  findTileByKey,
  findUnitOnTile,
  isTileOccupied,
  rankPlayersByTiles,
  unlockTechForPlayer
} from "@/lib/game/actions";
import {
  type AIActivityState,
  type AIStrategicMode,
  chooseAIMove,
  evaluateDesiredArmySize,
  evaluateExpansionPressure,
  evaluateStrategicMode,
  shouldBreakPeace,
  shouldRequestReinforcements
} from "@/lib/game/ai";
import { resolveUnitCombat, canUnitAttackTarget } from "@/lib/game/combatSystem";
import {
  createInitialPeaceMemories,
  evaluatePeaceWillingness,
  getDiplomacyPairKey,
  shouldAcceptPeaceOffer,
  shouldSendPeaceOffer,
  updatePeaceMemories
} from "@/lib/game/diplomacy";
import { applyTurnIncome, calculateTurnIncome } from "@/lib/game/economySystem";
import { createInitialGameState } from "@/lib/game/gameState";
import {
  discoverTileAndNeighborsOnMap,
  discoverTileKeys,
  getNewlyDiscoveredKeys,
  revealAroundAllUnits
} from "@/lib/game/fogOfWar";
import { axialDistance, getNeighborKeys } from "@/lib/game/map";
import { TECH_BY_ID } from "@/lib/game/techTree";
import { UNIT_PROGRESSION, UNIT_STATS } from "@/lib/game/unitSystem";
import { claimVillageTerritory, revealKeysForVillage } from "@/lib/game/villageSystem";
import type {
  AIDifficulty,
  DonationEntry,
  FogOfWarState,
  GameMode,
  LogEntry,
  MapSize,
  MatchConfig,
  PeaceOffer,
  PeacePairMemory,
  PeaceResolution,
  PeaceTreaty,
  Player,
  PlayerColor,
  RankingEntry,
  ReinforcementRequest,
  TechNodeId,
  Tile,
  Unit,
  UnitType,
  Village
} from "@/lib/game/types";
import { makeId } from "@/lib/game/utils";

type SetupState = {
  playerCount: number;
  aiCount: number;
  localPlayerColor: PlayerColor;
  gameMode: GameMode;
  aiDifficulty: AIDifficulty;
  mapSize: MapSize;
  matchInitialized: boolean;
};

type SetupUpdate = Partial<Pick<SetupState, "playerCount" | "aiCount" | "localPlayerColor" | "gameMode" | "aiDifficulty" | "mapSize">>;

type AnimatedActionRequest = {
  id: number;
  unitId: string;
  targetTileKey: string;
};

type GameStore = {
  setup: SetupState;
  players: Player[];
  tiles: Tile[];
  villages: Village[];
  units: Unit[];
  fogOfWar: Record<string, Record<string, boolean>>;
  currentPlayerId: string | null;
  humanPlayerId: string | null;
  hiddenMoveTileKeys: string[];
  actionAnimationBusy: boolean;
  pendingAnimatedAction: AnimatedActionRequest | null;
  lastCombatTurnByPair: Record<string, number>;
  diplomacyLog: LogEntry[];
  aiPlayerIds: string[];
  aiTurnInProgress: boolean;
  aiActivityByPlayer: Record<string, AIActivityState>;
  turnNumber: number;
  logs: LogEntry[];
  selectedTileKey: string | null;
  hoveredTileKey: string | null;
  selectedUnitId: string | null;
  techTreeOpen: boolean;
  gameOver: boolean;
  gameOverReason: string | null;
  ranking: RankingEntry[];

  setSetup: (update: SetupUpdate) => void;
  startLocalMatch: () => void;
  resetToMenu: () => void;
  initMatch: (config: MatchConfig) => void;
  selectTile: (key: string | null) => void;
  hoverTile: (key: string | null) => void;
  selectUnit: (unitId: string | null) => void;
  queueAnimatedUnitAction: (unitId: string, targetTileKey: string) => void;
  clearPendingAnimatedAction: (requestId?: number) => void;
  setActionAnimationBusy: (busy: boolean) => void;
  attemptUnitAction: (
    unitId: string,
    targetTileKey: string,
    options?: { visibilityPlayerId?: string | null; skipAnimationLock?: boolean }
  ) => { ok: boolean; error?: string; actionVisible?: boolean };
  unlockTech: (techId: TechNodeId) => { ok: boolean; error?: string };
  produceUnit: (
    unitType: UnitType,
    tileKey: string,
    options?: { visibilityPlayerId?: string | null }
  ) => { ok: boolean; error?: string };
  contactedPlayerIds: string[];
  factionContactPairs: string[];
  firstContactNotification: PlayerColor | null;
  diplomaticNotification: string | null;
  treatyAcceptedNotification: PlayerColor | null;
  peaceTreaties: PeaceTreaty[];
  outgoingTreaty: PeaceOffer | null;
  pendingTreatyResult: PeaceResolution | null;
  pendingPeaceTreaty: PeaceOffer | null;
  justBrokePeace: string[];
  peaceMemories: Record<string, PeacePairMemory>;
  aiPeaceDebugLog: string[];

  regenAnimUnitIds: string[];
  clearRegenAnims: () => void;

  // Reinforcement requests
  reinforcementRequest: ReinforcementRequest | null;
  reinforcementNotification: string | null;
  reinforcementCooldowns: Record<string, number>;
  unitDonorColors: Record<string, PlayerColor>;

  toggleTechTree: (open?: boolean) => void;
  healUnit: (unitId: string) => { ok: boolean; error?: string };
  dismissFirstContact: () => void;
  dismissDiplomaticNotification: () => void;
  dismissTreatyAccepted: () => void;
  sendPeaceTreaty: (toPlayerId: string) => void;
  respondToPeaceTreaty: (accept: boolean) => void;
  breakPeaceTreaty: (toPlayerId: string, options?: { skipActionLock?: boolean }) => void;
  sendReinforcementRequest: (toPlayerId: string) => void;
  respondToReinforcementRequest: (accept: boolean) => void;
  submitDonation: (entries: DonationEntry[]) => void;
  dismissReinforcementNotification: () => void;
  endTurn: () => void;
  runAITurn: () => Promise<void>;
};

const defaultSetup: SetupState = {
  playerCount: 2,
  aiCount: 1,
  localPlayerColor: "blue",
  gameMode: "pvp",
  aiDifficulty: "normal",
  mapSize: "medium",
  matchInitialized: false
};

const createLog = (turn: number, text: string, color?: PlayerColor): LogEntry => ({
  id: makeId("log"),
  turn,
  text,
  color
});

const getFactionPairKey = (a: string, b: string) => [a, b].sort().join(":");

const appendDiplomacyLog = (logs: LogEntry[], turn: number, text: string, color?: PlayerColor) =>
  [...logs, createLog(turn, text, color)].slice(-12);

const createColorOrder = (playerCount: number, localPlayerColor: PlayerColor): PlayerColor[] => {
  const safeCount = Math.min(5, Math.max(2, playerCount));
  const otherColors = PLAYER_COLORS.filter((color) => color !== localPlayerColor);
  return [localPlayerColor, ...otherColors].slice(0, safeCount);
};

const AI_DIFFICULTY_SETTINGS: Record<AIDifficulty, {
  maxProductionPerTurn: number;
  maxTechUnlocksPerTurn: number;
  visibleActionDelayMs: number;
  // productionChance applies only when army is already at target size
  productionChance: number;
}> = {
  easy: {
    maxProductionPerTurn: 2,
    maxTechUnlocksPerTurn: 1,
    visibleActionDelayMs: 190,
    productionChance: 0.65
  },
  normal: {
    maxProductionPerTurn: 3,
    maxTechUnlocksPerTurn: 1,
    visibleActionDelayMs: 170,
    productionChance: 0.90
  },
  hard: {
    maxProductionPerTurn: 4,
    maxTechUnlocksPerTurn: 2,
    visibleActionDelayMs: 130,
    productionChance: 1.0
  }
};

/**
 * Scans tiles to find pairs of distinct factions with adjacent territory.
 * Returns the pair keys that are newly discovered (not already in currentPairs).
 */
const detectFactionContacts = (tiles: Tile[], currentPairs: string[]): string[] => {
  const known = new Set(currentPairs);
  const newPairs: string[] = [];
  const tileKeyMap = new Map<string, Tile>(tiles.map((t) => [t.key, t]));

  for (const tile of tiles) {
    if (!tile.ownerId) continue;
    for (const nKey of getNeighborKeys(tile)) {
      const neighbor = tileKeyMap.get(nKey);
      if (!neighbor?.ownerId || neighbor.ownerId === tile.ownerId) continue;
      const pairKey = getFactionPairKey(tile.ownerId, neighbor.ownerId);
      if (!known.has(pairKey)) {
        known.add(pairKey);
        newPairs.push(pairKey);
      }
    }
  }

  return newPairs;
};

const pickBestAvailableTechForAI = (player: Player) => {
  const available = Object.values(TECH_BY_ID).filter((tech) => {
    if (player.unlockedTechIds.includes(tech.id)) return false;
    if (!tech.prerequisites.every((prereq) => player.unlockedTechIds.includes(prereq))) return false;
    return player.gold >= tech.cost;
  });

  if (available.length === 0) return null;
  return available.sort((a, b) => b.cost - a.cost)[0];
};

const chooseAIUnitTypeToProduce = (
  player: Player,
  difficulty: AIDifficulty,
  ownedUnits: Unit[],
  capitalThreat: number,
  strategicMode: AIStrategicMode,
  scoutingUrgency: number
): UnitType | null => {
  const unlocked = UNIT_PROGRESSION.filter((unitType) => {
    if (unitType === "basic_soldier") return true;
    return player.unlockedTechIds.some((techId) => TECH_BY_ID[techId]?.unlockedUnitType === unitType);
  }).filter((unitType) => player.gold >= UNIT_STATS[unitType].productionCost) as UnitType[];

  if (unlocked.length === 0) return null;

  // ── Composition analysis ───────────────────────────────────────────────────
  const totalArmy = ownedUnits.length;
  const frontlineTypes: UnitType[] = ["tank", "warrior", "strong_soldier"];
  const frontlineCount = ownedUnits.filter((u) => frontlineTypes.includes(u.type)).length;
  const patriotCount = ownedUnits.filter((u) => u.type === "patriot").length;

  // Target ratios: ~55% frontline, ~35% patriot, rest other
  const targetFrontline = Math.max(1, Math.round(totalArmy * 0.55));
  const targetPatriot = totalArmy > 2 ? Math.round(totalArmy * 0.35) : 0;

  const tankCost = UNIT_STATS.tank.productionCost;

  // 1. Capital under threat → rush defensive unit if possible
  if (capitalThreat > 3 && unlocked.includes("patriot") && patriotCount < totalArmy * 0.5) {
    return "patriot";
  }

  if (scoutingUrgency > 0) {
    for (const type of ["aircraft", "attack_helicopter", "strong_soldier", "basic_soldier"] as UnitType[]) {
      if (unlocked.includes(type)) return type;
    }
  }

  // 2. Excess gold → spend on the strongest available (tanks first)
  if (player.gold >= tankCost * 2 && unlocked.includes("tank")) {
    return "tank";
  }

  // 3. Composition: too few patriots → build one
  if (patriotCount < targetPatriot && unlocked.includes("patriot")) {
    return "patriot";
  }

  // 4. Composition: need more frontline → build best frontline available
  if (frontlineCount < targetFrontline) {
    for (const type of ["tank", "warrior", "strong_soldier"] as UnitType[]) {
      if (unlocked.includes(type)) return type;
    }
  }

  if ((strategicMode === "Defense" || strategicMode === "Desperation") && unlocked.includes("patriot")) {
    return "patriot";
  }

  // 5. Easy: always buy cheapest affordable unit
  if (difficulty === "easy") {
    return unlocked.sort((a, b) => UNIT_STATS[a].productionCost - UNIT_STATS[b].productionCost)[0];
  }

  // 6. Normal/Hard: buy strongest affordable unit
  return unlocked.sort((a, b) => UNIT_STATS[b].productionCost - UNIT_STATS[a].productionCost)[0];
};

const chooseAISpawnTile = (
  tiles: Tile[],
  units: Unit[],
  aiPlayerId: string,
  discovered: Record<string, boolean>,
  unitType: UnitType
) => {
  const enemyUnits = units.filter((unit) => unit.ownerId !== aiPlayerId && discovered[unit.tileKey]);
  // Production is only valid on capital and village tiles
  const candidates = tiles.filter(
    (tile) => tile.ownerId === aiPlayerId && (tile.isCapital || tile.villageId !== null) && !isTileOccupied(units, tile.key)
  );
  if (candidates.length === 0) return null;

  const capitalTile = tiles.find((t) => t.ownerId === aiPlayerId && t.isCapital);
  // Defensive units (patriot) spawn near capital; frontline near borders
  const isDefensive = unitType === "patriot";

  const scoreTile = (tile: Tile) => {
    let score = 0;

    if (isDefensive) {
      // Patriots: strongly prefer spawning close to capital
      if (tile.isCapital) score += 30;
      if (capitalTile) {
        const distToCapital = axialDistance(tile, capitalTile);
        score += Math.max(0, 20 - distToCapital * 5);
      }
    } else {
      // Frontline: prefer village/mine tiles near enemies
      if (tile.villageId) score += 12;
      if (tile.hasGoldMine) score += 9;
      if (tile.isCapital) score += 5;

      const nearestEnemyUnitDist = enemyUnits.length
        ? Math.min(
          ...enemyUnits.map((enemy) => {
            const enemyTile = tiles.find((entry) => entry.key === enemy.tileKey);
            if (!enemyTile) return Number.POSITIVE_INFINITY;
            return axialDistance(tile, enemyTile);
          })
        )
        : Number.POSITIVE_INFINITY;

      if (nearestEnemyUnitDist <= 2) score += 20;
      else if (nearestEnemyUnitDist <= 4) score += 12;
      else if (nearestEnemyUnitDist <= 6) score += 6;

      if (!tile.isCapital && !tile.villageId && !tile.hasGoldMine) score += 3;
    }

    return score;
  };

  return candidates.sort((a, b) => scoreTile(b) - scoreTile(a))[0] ?? null;
};

const resetMovementForPlayer = (units: Unit[], playerId: string) =>
  units.map((unit) => (unit.ownerId === playerId ? { ...unit, hasMovedThisTurn: false, hasAttackedThisTurn: false, movesUsed: 0 } : unit));

const updatePlayerAliveState = (players: Player[], tiles: Tile[], units: Unit[]) =>
  players.map((player) => {
    const ownsTiles = tiles.some((tile) => tile.ownerId === player.id);
    const hasUnits = units.some((unit) => unit.ownerId === player.id);
    return {
      ...player,
      isAlive: ownsTiles || hasUnits
    };
  });

const getCapitalOwnerIds = (tiles: Tile[]) =>
  Array.from(new Set(tiles.filter((tile) => tile.isCapital && tile.ownerId).map((tile) => tile.ownerId as string)));

const arePeacePartners = (treaties: PeaceTreaty[], a: string, b: string) =>
  treaties.some((t) => (t.playerA === a && t.playerB === b) || (t.playerA === b && t.playerB === a));

const PEACE_OFFER_COOLDOWN_TURNS = 4;
const PEACE_REJECTION_COOLDOWN_TURNS = 6;
const PEACE_BROKEN_COOLDOWN_TURNS = 10;

const addPeaceDebugEntry = (entries: string[], message: string) => {
  const next = [...entries, message];
  return next.slice(-40);
};

const canSendPeaceOfferNow = (
  memories: Record<string, PeacePairMemory>,
  fromPlayerId: string,
  toPlayerId: string,
  turnNumber: number
) => {
  const memory = memories[getDiplomacyPairKey(fromPlayerId, toPlayerId)];
  if (!memory) return true;
  if (memory.lastOfferTurn !== null && turnNumber - memory.lastOfferTurn < PEACE_OFFER_COOLDOWN_TURNS) return false;
  if (memory.lastRejectedTurn !== null && turnNumber - memory.lastRejectedTurn < PEACE_REJECTION_COOLDOWN_TURNS) return false;
  if (memory.lastBrokenTurn !== null && turnNumber - memory.lastBrokenTurn < PEACE_BROKEN_COOLDOWN_TURNS) return false;
  return true;
};

const recordPeaceOffer = (
  memories: Record<string, PeacePairMemory>,
  fromPlayerId: string,
  toPlayerId: string,
  turnNumber: number
) => {
  const key = getDiplomacyPairKey(fromPlayerId, toPlayerId);
  const memory = memories[key];
  if (!memory) return memories;
  return {
    ...memories,
    [key]: {
      ...memory,
      lastOfferTurn: turnNumber
    }
  };
};

const recordPeaceRejection = (
  memories: Record<string, PeacePairMemory>,
  fromPlayerId: string,
  toPlayerId: string,
  turnNumber: number
) => {
  const key = getDiplomacyPairKey(fromPlayerId, toPlayerId);
  const memory = memories[key];
  if (!memory) return memories;
  return {
    ...memories,
    [key]: {
      ...memory,
      lastRejectedTurn: turnNumber
    }
  };
};

const recordBrokenPeace = (
  memories: Record<string, PeacePairMemory>,
  breakerId: string,
  otherId: string,
  turnNumber: number
) => {
  const key = getDiplomacyPairKey(breakerId, otherId);
  const memory = memories[key];
  if (!memory) return memories;
  return {
    ...memories,
    [key]: {
      ...memory,
      lastBrokenTurn: turnNumber,
      trustPenalty: Math.min(35, memory.trustPenalty + 18)
    }
  };
};

const buildPeaceOffer = (
  fromPlayerId: string,
  toPlayerId: string,
  players: Player[],
  reason: string,
  score: number,
  turnNumber: number,
  direction: PeaceOffer["direction"]
): PeaceOffer | null => {
  const fromPlayer = players.find((player) => player.id === fromPlayerId);
  const toPlayer = players.find((player) => player.id === toPlayerId);
  if (!fromPlayer || !toPlayer) return null;
  return {
    fromPlayerId,
    toPlayerId,
    fromColor: fromPlayer.color,
    toColor: toPlayer.color,
    reason,
    score,
    turnSent: turnNumber,
    direction
  };
};

const appendPeaceTreaty = (treaties: PeaceTreaty[], playerA: string, playerB: string) => {
  if (arePeacePartners(treaties, playerA, playerB)) return treaties;
  return [...treaties, { playerA, playerB }];
};

/**
 * Scans the entire visible fog for the human player and returns any faction IDs
 * that are visible but not yet in contactedPlayerIds. Safe to call repeatedly —
 * already-known factions are never returned twice.
 */
const detectContactsFromFog = (
  humanPlayerId: string,
  contactedPlayerIds: string[],
  tiles: Tile[],
  units: Unit[],
  fog: FogOfWarState,
  players: Player[]
): { newIds: string[]; newColors: PlayerColor[] } => {
  const humanFog = fog[humanPlayerId] ?? {};
  const known = new Set(contactedPlayerIds);
  const newIds: string[] = [];
  const newColors: PlayerColor[] = [];

  const register = (ownerId: string) => {
    if (known.has(ownerId)) return;
    known.add(ownerId);
    newIds.push(ownerId);
    const color = players.find((p) => p.id === ownerId)?.color;
    if (color) newColors.push(color);
  };

  for (const tile of tiles) {
    if (!humanFog[tile.key] || !tile.ownerId || tile.ownerId === humanPlayerId) continue;
    register(tile.ownerId);
  }
  for (const unit of units) {
    if (unit.ownerId === humanPlayerId || !humanFog[unit.tileKey]) continue;
    register(unit.ownerId);
  }

  return { newIds, newColors };
};

const applyVillageDiscoveryEffects = ({
  villages,
  tiles,
  fog,
  playerId,
  playerColor,
  beforeFog,
  logs,
  turnNumber
}: {
  villages: Village[];
  tiles: Tile[];
  fog: FogOfWarState;
  playerId: string;
  playerColor?: PlayerColor;
  beforeFog: FogOfWarState;
  logs: LogEntry[];
  turnNumber: number;
}) => {
  let nextVillages = villages;
  let nextTiles = tiles;
  let nextFog = fog;
  const nextLogs = [...logs];

  const seenVillageIds = new Set<string>(
    villages
      .filter((village) => Boolean(beforeFog[playerId]?.[village.tileKey]))
      .map((village) => village.id)
  );

  while (true) {
    const newlyVisible = nextVillages.filter(
      (village) => !seenVillageIds.has(village.id) && Boolean(nextFog[playerId]?.[village.tileKey])
    );

    if (newlyVisible.length === 0) break;

    for (const village of newlyVisible) {
      seenVillageIds.add(village.id);
      const revealKeys = revealKeysForVillage(nextTiles, nextVillages, village.id);
      nextFog = discoverTileKeys(nextFog, playerId, revealKeys);

      if (village.ownerId === null) {
        const claim = claimVillageTerritory(nextTiles, nextVillages, village.id, playerId);
        nextTiles = claim.tiles;
        nextVillages = claim.villages;
        nextLogs.push(createLog(turnNumber, "Neutral city claimed", playerColor));
      }
    }
  }

  return {
    villages: nextVillages,
    tiles: nextTiles,
    fog: nextFog,
    logs: nextLogs
  };
};

// ── Reinforcement helpers ─────────────────────────────────────────────────────

const REINFORCEMENT_COOLDOWN_TURNS = 4;
const MAX_DONATION_UNITS = 5;

/** Find empty owned tiles for a receiving player, sorted closest to their capital first. */
const findDonationSpawnTiles = (
  receiverId: string,
  tiles: Tile[],
  units: Unit[],
  count: number
): string[] => {
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

/** Should an AI donate when asked for reinforcements? */
const evaluateAIDonationDecision = (
  aiId: string,
  requesterId: string,
  tiles: Tile[],
  units: Unit[],
  players: Player[],
  difficulty: AIDifficulty
): boolean => {
  const aiPlayer = players.find((p) => p.id === aiId);
  if (!aiPlayer || aiPlayer.gold < UNIT_STATS.basic_soldier.productionCost) return false;

  const aiCapital = tiles.find((t) => t.isCapital && t.ownerId === aiId);
  const tileMap = new Map(tiles.map((t) => [t.key, t]));
  const aiEnemyUnits = units.filter((u) => u.ownerId !== aiId && u.ownerId !== requesterId);

  // Count threat to AI's own capital
  let selfThreat = 0;
  if (aiCapital) {
    for (const enemy of aiEnemyUnits) {
      const et = tileMap.get(enemy.tileKey);
      if (!et) continue;
      const dist = axialDistance(aiCapital, et);
      if (dist <= 3) selfThreat += (4 - dist);
    }
  }
  if (selfThreat >= 5) return false; // too threatened to donate

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

/** Pick units for the AI to donate, staying within budget and MAX_DONATION_UNITS. */
const pickAIDonationUnits = (aiPlayer: Player, difficulty: AIDifficulty): DonationEntry[] => {
  const budget = Math.floor(aiPlayer.gold * (difficulty === "hard" ? 0.45 : difficulty === "normal" ? 0.35 : 0.25));
  if (budget < UNIT_STATS.basic_soldier.productionCost) return [];

  const DONATION_PREFERENCE: UnitType[] = ["basic_soldier", "strong_soldier", "warrior", "machine_gunner"];
  const remaining = budget;
  const totalUnits = 0;

  for (const unitType of DONATION_PREFERENCE) {
    if (unitType !== "basic_soldier") {
      const unlocked = aiPlayer.unlockedTechIds.some(
        (techId) => TECH_BY_ID[techId]?.unlockedUnitType === unitType
      );
      if (!unlocked) continue;
    }
    const cost = UNIT_STATS[unitType].productionCost;
    if (remaining < cost) continue;
    const maxByBudget = Math.floor(remaining / cost);
    const maxBySlots = MAX_DONATION_UNITS - totalUnits;
    const qty = Math.min(maxByBudget, maxBySlots, difficulty === "hard" ? 3 : 2);
    if (qty <= 0) continue;
    return [{ unitType, quantity: qty }];
  }
  return [];
};

const createMatchState = (config: MatchConfig) => {
  const initial = createInitialGameState(config);
  const ensuredFog = revealAroundAllUnits(initial.fogOfWar, initial.units, initial.tiles, 1);
  const peaceMemories = createInitialPeaceMemories(initial.players, initial.tiles, initial.units, initial.villages, 1);
  const aiPlayerIds = config.aiPlayerIds ?? [];
  const aiActivityByPlayer = Object.fromEntries(
    aiPlayerIds.map((playerId) => [playerId, {
      turnsWithoutProduction: 0,
      turnsWithoutExploration: 0,
      turnsBoxedIn: 0,
      turnsBelowTargetArmy: 0,
      lastStrategicMode: null
    } satisfies AIActivityState])
  ) as Record<string, AIActivityState>;

  return {
    players: initial.players,
    tiles: initial.tiles,
    villages: initial.villages,
    units: initial.units,
    fogOfWar: ensuredFog,
    currentPlayerId: initial.players[0]?.id ?? null,
    humanPlayerId: (config.aiPlayerIds?.length ?? 0) > 0
      ? initial.players.find((p) => !config.aiPlayerIds!.includes(p.id))?.id ?? null
      : null,
    hiddenMoveTileKeys: [],
    actionAnimationBusy: false,
    pendingAnimatedAction: null,
    lastCombatTurnByPair: {},
    diplomacyLog: [],
    aiPlayerIds,
    aiTurnInProgress: false,
    aiActivityByPlayer,
    turnNumber: 1,
    logs: [createLog(1, "Match started")],
    selectedTileKey: null,
    hoveredTileKey: null,
    selectedUnitId: null,
    techTreeOpen: false,
    gameOver: false,
    gameOverReason: null,
    ranking: [],
    contactedPlayerIds: [],
    factionContactPairs: detectFactionContacts(initial.tiles, []),
    firstContactNotification: null,
    diplomaticNotification: null,
    treatyAcceptedNotification: null,
    peaceTreaties: [],
    outgoingTreaty: null,
    pendingTreatyResult: null,
    pendingPeaceTreaty: null,
    justBrokePeace: [],
    peaceMemories,
    aiPeaceDebugLog: [],
    regenAnimUnitIds: [],
    reinforcementRequest: null,
    reinforcementNotification: null,
    reinforcementCooldowns: {},
    unitDonorColors: {}
  };
};

export const useGameStore = create<GameStore>((set, get) => ({
  setup: defaultSetup,
  players: [],
  tiles: [],
  villages: [],
  units: [],
  fogOfWar: {},
  currentPlayerId: null,
  humanPlayerId: null,
  hiddenMoveTileKeys: [],
  actionAnimationBusy: false,
  pendingAnimatedAction: null,
  lastCombatTurnByPair: {},
  diplomacyLog: [],
  aiPlayerIds: [],
  aiTurnInProgress: false,
  aiActivityByPlayer: {},
  turnNumber: 1,
  logs: [],
  selectedTileKey: null,
  hoveredTileKey: null,
  selectedUnitId: null,
  techTreeOpen: false,
  gameOver: false,
  gameOverReason: null,
  ranking: [],
  contactedPlayerIds: [],
  factionContactPairs: [],
  firstContactNotification: null,
  diplomaticNotification: null,
  treatyAcceptedNotification: null,
  peaceTreaties: [],
  outgoingTreaty: null,
  pendingTreatyResult: null,
  pendingPeaceTreaty: null,
  justBrokePeace: [],
  peaceMemories: {},
  aiPeaceDebugLog: [],
  regenAnimUnitIds: [],
  reinforcementRequest: null,
  reinforcementNotification: null,
  reinforcementCooldowns: {},
  unitDonorColors: {},

  clearRegenAnims: () => set({ regenAnimUnitIds: [] }),
  queueAnimatedUnitAction: (unitId, targetTileKey) =>
    set((state) => ({
      pendingAnimatedAction: {
        id: (state.pendingAnimatedAction?.id ?? 0) + 1,
        unitId,
        targetTileKey
      }
    })),
  clearPendingAnimatedAction: (requestId) =>
    set((state) => {
      if (!state.pendingAnimatedAction) return state;
      if (requestId !== undefined && state.pendingAnimatedAction.id !== requestId) return state;
      return { pendingAnimatedAction: null };
    }),
  setActionAnimationBusy: (busy) => set({ actionAnimationBusy: busy }),

  setSetup: (update) =>
    set((state) => {
      const newMode = update.gameMode ?? state.setup.gameMode;
      const newAiCount = update.aiCount !== undefined
        ? Math.min(4, Math.max(1, update.aiCount))
        : state.setup.aiCount;
      const newPlayerCount = newMode === "pvai"
        ? newAiCount + 1
        : update.playerCount
          ? Math.min(5, Math.max(2, update.playerCount))
          : state.setup.playerCount;
      return {
        setup: {
          ...state.setup,
          ...update,
          aiCount: newAiCount,
          playerCount: newPlayerCount,
          localPlayerColor: update.localPlayerColor ?? state.setup.localPlayerColor,
          gameMode: newMode,
          aiDifficulty: update.aiDifficulty ?? state.setup.aiDifficulty,
          mapSize: update.mapSize ?? state.setup.mapSize
        }
      };
    }),

  startLocalMatch: () => {
    const state = get();
    const playerCount = state.setup.playerCount;
    const colors = createColorOrder(playerCount, state.setup.localPlayerColor);
    const aiPlayerIds = state.setup.gameMode === "pvai"
      ? Array.from({ length: state.setup.aiCount }, (_, i) => `player_${i + 2}`)
      : [];
    const matchState = createMatchState({
      playerCount,
      colors,
      mapSize: state.setup.mapSize,
      aiPlayerIds
    });

    set({
      ...matchState,
      setup: {
        ...state.setup,
        matchInitialized: true
      }
    });
  },

  resetToMenu: () =>
    set((state) => ({
      ...createMatchState({ playerCount: 2, colors: ["blue", "red"], mapSize: "medium" }),
      players: [],
      tiles: [],
      villages: [],
      units: [],
      fogOfWar: {},
      currentPlayerId: null,
      humanPlayerId: null,
      hiddenMoveTileKeys: [],
      actionAnimationBusy: false,
      pendingAnimatedAction: null,
      logs: [],
      turnNumber: 1,
      setup: {
        ...state.setup,
        matchInitialized: false
      }
    })),

  initMatch: (config) => {
    const matchState = createMatchState(config);
    set((state) => ({
      ...matchState,
      setup: {
        ...state.setup,
        playerCount: config.playerCount,
        localPlayerColor: config.colors[0] ?? state.setup.localPlayerColor,
        gameMode: (config.aiPlayerIds?.length ?? 0) > 0 ? "pvai" : "pvp",
        mapSize: config.mapSize,
        matchInitialized: true
      }
    }));
  },

  selectTile: (key) => set({ selectedTileKey: key }),
  hoverTile: (key) => set({ hoveredTileKey: key }),
  selectUnit: (unitId) => set({ selectedUnitId: unitId }),

  attemptUnitAction: (unitId, targetTileKey, options) => {
    const state = get();
    if (state.gameOver || !state.currentPlayerId) return { ok: false, error: "No active turn." };
    if (state.actionAnimationBusy && !options?.skipAnimationLock) return { ok: false, error: "Action animation in progress." };

    const unit = state.units.find((entry) => entry.id === unitId);
    if (!unit || unit.ownerId !== state.currentPlayerId) return { ok: false, error: "Invalid unit." };

    const stats = UNIT_STATS[unit.type];
    const isAirUnit = stats.domain === "air";
    const movesUsed = unit.movesUsed ?? 0;
    // Air units have a movement budget shared across pre-attack and post-attack legs.
    // hasMovedThisTurn=true for air units means budget exhausted.
    if (unit.hasMovedThisTurn) return { ok: false, error: "This unit has no actions left this turn." };
    if (state.justBrokePeace.length > 0) return { ok: false, error: "Cannot act after breaking a peace treaty. End your turn." };

    const sourceTile = findTileByKey(state.tiles, unit.tileKey);
    const targetTile = findTileByKey(state.tiles, targetTileKey);
    if (!sourceTile || !targetTile) return { ok: false, error: "Invalid tile." };

    // Air units consume from a shared movement budget; ground units use full range per turn
    const effectiveMovementRange = isAirUnit ? stats.movementRange - movesUsed : stats.movementRange;
    const movementRange = effectiveMovementRange;
    const attackRange = stats.attackRange;
    const distance = axialDistance(sourceTile, targetTile);

    const occupant = findUnitOnTile(state.units, targetTile.key);
    if (occupant && occupant.ownerId === unit.ownerId) {
      return { ok: false, error: "Target tile is occupied by your own unit." };
    }

    const isEnemyOccupied = Boolean(occupant && occupant.ownerId !== unit.ownerId);
    // Ranged attack: beyond movement range but within attack range, targeting an enemy
    const isRangedAttack = isEnemyOccupied && distance > movementRange && distance <= attackRange;

    if (!isRangedAttack && distance > movementRange) {
      return { ok: false, error: `Out of range. Max range is ${movementRange}.` };
    }

    // Can't attack an enemy that's beyond this unit's attack range (even if within movement range)
    if (isEnemyOccupied && distance > attackRange) {
      return { ok: false, error: `Out of attack range. Attack range is ${attackRange}.` };
    }

    // Aircraft that already attacked this turn can only move, not attack again
    if (unit.hasAttackedThisTurn && isEnemyOccupied) {
      return { ok: false, error: "This unit has already attacked this turn." };
    }

    let nextTiles = state.tiles;
    let nextVillages = state.villages;
    let nextUnits = state.units;
    let nextFog = state.fogOfWar;
    let nextLastCombatTurnByPair = state.lastCombatTurnByPair;
    const movingIntoPeaceTerritory = targetTile.ownerId !== null &&
      arePeacePartners(state.peaceTreaties, unit.ownerId, targetTile.ownerId);
    const nextLogs = [...state.logs];
    const beforeFog = state.fogOfWar;
    let movedIntoTarget = false;
    const tileKeySet = new Set(state.tiles.map((tile) => tile.key));
    const visibilityPlayerId = options?.visibilityPlayerId ?? null;
    const actionVisible = !visibilityPlayerId
      ? true
      : Boolean(
        state.fogOfWar[visibilityPlayerId]?.[sourceTile.key] ||
        state.fogOfWar[visibilityPlayerId]?.[targetTile.key]
      );
    const actorColor = state.players.find((p) => p.id === unit.ownerId)?.color;

    if (occupant && occupant.ownerId !== unit.ownerId) {
      const combatPairKey = getFactionPairKey(unit.ownerId, occupant.ownerId);
      nextLastCombatTurnByPair = {
        ...state.lastCombatTurnByPair,
        [combatPairKey]: state.turnNumber
      };
      if (!state.factionContactPairs.includes(combatPairKey)) {
        set({ factionContactPairs: [...state.factionContactPairs, combatPairKey] });
      }
      if (arePeacePartners(state.peaceTreaties, unit.ownerId, occupant.ownerId)) {
        return { ok: false, error: "Cannot attack a peace partner." };
      }
      if (state.justBrokePeace.includes(occupant.ownerId)) {
        return { ok: false, error: "Cannot attack this turn after breaking peace." };
      }
      if (!canUnitAttackTarget(unit, occupant)) {
        return { ok: false, error: "Ground units cannot attack aircraft." };
      }

      const combat = resolveUnitCombat(unit, occupant);

      // Air units keep their remaining movement budget after attacking; ground units are done
      const movesRemaining = isAirUnit ? stats.movementRange - movesUsed : 0;
      nextUnits = nextUnits.map((entry) =>
        entry.id === unit.id
          ? {
            ...entry,
            hasMovedThisTurn: movesRemaining <= 0,
            hasAttackedThisTurn: true
          }
          : entry
      );

      if (combat.defenderDestroyed) {
        // Air units never advance on kill (can't land on tiles via combat); ranged attackers also stay
        const advancesToTile = !isRangedAttack && !isAirUnit;
        nextUnits = nextUnits
          .filter((entry) => entry.id !== occupant.id)
          .map((entry) =>
            entry.id === unit.id && advancesToTile
              ? {
                ...entry,
                tileKey: targetTile.key
              }
              : entry
          );

        if (advancesToTile) {
          nextTiles = nextTiles.map((tile) =>
            tile.key === targetTile.key
              ? {
                ...tile,
                ownerId: unit.ownerId
              }
              : tile
          );
          movedIntoTarget = true;
        }

        if (actionVisible) {
          nextLogs.push(
            createLog(
              state.turnNumber,
              `${UNIT_STATS[unit.type].name} destroyed ${UNIT_STATS[occupant.type].name}`,
              actorColor
            )
          );
        }
      } else {
        nextUnits = nextUnits.map((entry) =>
          entry.id === occupant.id
            ? {
              ...entry,
              health: combat.defenderHealthAfter
            }
            : entry
        );

        if (actionVisible) {
          nextLogs.push(
            createLog(
              state.turnNumber,
              `${UNIT_STATS[unit.type].name} hit ${UNIT_STATS[occupant.type].name} · ${Math.max(0, combat.defenderHealthAfter)} HP left`,
              actorColor
            )
          );
        }
      }
    } else {
      // Air units cannot land on cities or capitals
      if (isAirUnit && (targetTile.isCapital || targetTile.villageId !== null)) {
        return { ok: false, error: "Air units cannot land on cities or capitals." };
      }
      // Air units that already moved but haven't attacked yet cannot move again
      if (isAirUnit && movesUsed > 0 && !unit.hasAttackedThisTurn) {
        return { ok: false, error: "Attack before making a second move." };
      }

      const newMovesUsed = isAirUnit ? movesUsed + distance : 0;
      // First move (before attacking): keep hasMovedThisTurn=false so attack is still available.
      // Second move (after attacking): hasMovedThisTurn=true, turn is over.
      const airDoneAfterMove = isAirUnit && unit.hasAttackedThisTurn;
      nextUnits = nextUnits.map((entry) =>
        entry.id === unit.id
          ? {
            ...entry,
            tileKey: targetTile.key,
            hasMovedThisTurn: !isAirUnit || airDoneAfterMove,
            movesUsed: newMovesUsed
          }
          : entry
      );

      if (!movingIntoPeaceTerritory && !isAirUnit) {
        nextTiles = nextTiles.map((tile) =>
          tile.key === targetTile.key
            ? { ...tile, ownerId: unit.ownerId }
            : tile
        );
      }

      movedIntoTarget = true;
    }

    if (movedIntoTarget) {
      const updatedTargetTile = nextTiles.find((tile) => tile.key === targetTile.key);
      if (updatedTargetTile) {
        nextFog = discoverTileAndNeighborsOnMap(nextFog, unit.ownerId, updatedTargetTile, tileKeySet);
      }

      const targetVillage = nextVillages.find((village) => village.tileKey === targetTile.key) ?? null;
      if (targetVillage && targetVillage.ownerId !== unit.ownerId && !movingIntoPeaceTerritory) {
        const claim = claimVillageTerritory(nextTiles, nextVillages, targetVillage.id, unit.ownerId);
        nextTiles = claim.tiles;
        nextVillages = claim.villages;
        if (actionVisible) {
          nextLogs.push(createLog(state.turnNumber, "City captured", actorColor));
        }
      }

      if (targetTile.isCapital && targetTile.ownerId && targetTile.ownerId !== unit.ownerId && !movingIntoPeaceTerritory) {
        const defeatedId = targetTile.ownerId;
        nextTiles = nextTiles.map((tile) =>
          tile.ownerId === defeatedId ? { ...tile, ownerId: unit.ownerId } : tile
        );
        nextVillages = nextVillages.map((village) =>
          village.ownerId === defeatedId ? { ...village, ownerId: unit.ownerId } : village
        );
        nextUnits = nextUnits.filter((u) => u.ownerId !== defeatedId);
        const defeatedColor = state.players.find((p) => p.id === defeatedId)?.color ?? defeatedId;
        nextLogs.push(createLog(state.turnNumber, `${defeatedColor} eliminated — territory annexed`, actorColor));
      }

      const discovery = applyVillageDiscoveryEffects({
        villages: nextVillages,
        tiles: nextTiles,
        fog: nextFog,
        playerId: unit.ownerId,
        playerColor: actorColor,
        beforeFog,
        logs: nextLogs,
        turnNumber: state.turnNumber
      });

      nextVillages = discovery.villages;
      nextTiles = discovery.tiles;
      nextFog = discovery.fog;
      nextLogs.splice(0, nextLogs.length, ...discovery.logs);
      nextFog = revealAroundAllUnits(nextFog, nextUnits, nextTiles, 1);

      if (!occupant) {
        const discoveredBefore = Boolean(beforeFog[unit.ownerId]?.[targetTile.key]);
        if (actionVisible) {
          nextLogs.push(
            createLog(
              state.turnNumber,
              discoveredBefore
                ? `${UNIT_STATS[unit.type].name} advanced`
                : `${UNIT_STATS[unit.type].name} explored new territory`,
              actorColor
            )
          );
        }
      }
    }

    const alivePlayers = updatePlayerAliveState(state.players, nextTiles, nextUnits);
    const capitalOwnerIds = getCapitalOwnerIds(nextTiles);
    const winnerId = capitalOwnerIds.length === 1 ? capitalOwnerIds[0] : null;
    const winnerColor = winnerId ? alivePlayers.find((player) => player.id === winnerId)?.color ?? winnerId : null;
    const gameOver = state.gameOver || Boolean(winnerId);
    const gameOverReason = winnerId
      ? `${winnerColor} controls all capitals. Match finished.`
      : state.gameOverReason;
    const ranking = winnerId ? rankPlayersByTiles(nextTiles, alivePlayers) : state.ranking;

    let finalFog = revealAroundAllUnits(nextFog, nextUnits, nextTiles, 1);

    const newlyDiscovered = getNewlyDiscoveredKeys(beforeFog, finalFog, unit.ownerId);
    for (const key of newlyDiscovered) {
      const originalTile = state.tiles.find((t) => t.key === key);
      if (originalTile?.isCapital && originalTile.ownerId && originalTile.ownerId !== unit.ownerId) {
        const capitalOwnerTileKeys = state.tiles
          .filter((t) => t.ownerId === originalTile.ownerId)
          .map((t) => t.key);
        finalFog = discoverTileKeys(finalFog, unit.ownerId, capitalOwnerTileKeys);
        const capitalOwnerColor = alivePlayers.find((p) => p.id === originalTile.ownerId)?.color ?? originalTile.ownerId;
        nextLogs.push(createLog(state.turnNumber, `${capitalOwnerColor}'s capital revealed`));
        break;
      }
    }

    // First contact detection (human player perspective only)
    let nextContactedPlayerIds = state.contactedPlayerIds;
    let nextFirstContactNotification = state.firstContactNotification;
    if (state.humanPlayerId) {
      const { newIds, newColors } = detectContactsFromFog(
        state.humanPlayerId, state.contactedPlayerIds, nextTiles, nextUnits, finalFog, alivePlayers
      );
      if (newIds.length > 0) {
        nextContactedPlayerIds = [...state.contactedPlayerIds, ...newIds];
        nextFirstContactNotification = newColors[0] ?? null;
        for (const color of newColors) {
          nextLogs.push(createLog(state.turnNumber, `First contact with ${color}`, color));
        }
      }
    }

    // If the human player was just eliminated — reveal the full map and expose all players
    if (state.humanPlayerId) {
      const humanWasAlive = state.players.find((p) => p.id === state.humanPlayerId)?.isAlive ?? true;
      const humanIsNowAlive = alivePlayers.find((p) => p.id === state.humanPlayerId)?.isAlive ?? false;
      if (humanWasAlive && !humanIsNowAlive) {
        finalFog = {
          ...finalFog,
          [state.humanPlayerId]: Object.fromEntries(nextTiles.map((t) => [t.key, true]))
        };
        nextContactedPlayerIds = alivePlayers.map((p) => p.id);
      }
    }

    set({
      players: alivePlayers,
      tiles: nextTiles,
      villages: nextVillages,
      units: nextUnits,
      fogOfWar: finalFog,
      lastCombatTurnByPair: nextLastCombatTurnByPair,
      selectedTileKey: targetTile.key,
      logs: nextLogs,
      gameOver,
      gameOverReason,
      ranking,
      contactedPlayerIds: nextContactedPlayerIds,
      firstContactNotification: nextFirstContactNotification
    });

    return { ok: true, actionVisible };
  },

  unlockTech: (techId) => {
    const state = get();
    if (!state.currentPlayerId || state.gameOver) return { ok: false, error: "No active player." };

    const result = unlockTechForPlayer(state.players, state.currentPlayerId, techId);
    if (!result.ok) return { ok: false, error: result.error };

    const techName = TECH_BY_ID[techId].name;
    const actorColor = state.players.find((p) => p.id === state.currentPlayerId)?.color;
    set({
      players: result.players,
      logs: [...state.logs, createLog(state.turnNumber, `Unlocked ${techName}`, actorColor)]
    });

    return { ok: true };
  },

  produceUnit: (unitType, tileKey, options) => {
    const state = get();
    if (!state.currentPlayerId || state.gameOver) return { ok: false, error: "No active turn." };

    const player = state.players.find((entry) => entry.id === state.currentPlayerId);
    if (!player) return { ok: false, error: "Player not found." };

    const tile = findTileByKey(state.tiles, tileKey);
    if (!tile) return { ok: false, error: "Invalid tile." };
    if (tile.ownerId !== player.id) return { ok: false, error: "You can only produce on owned tiles." };
    if (!tile.isCapital && !tile.villageId) return { ok: false, error: "You can only produce on a city or capital tile." };
    const occupyingUnit = findUnitOnTile(state.units, tileKey);
    if (occupyingUnit) {
      if (!arePeacePartners(state.peaceTreaties, player.id, occupyingUnit.ownerId)) {
        return { ok: false, error: "Tile is occupied." };
      }
      // Peace partner unit: will be displaced to nearest empty tile
    }
    if (!canProduceUnit(player, unitType)) return { ok: false, error: "Unit tech is locked." };

    const cost = UNIT_STATS[unitType].productionCost;
    if (player.gold < cost) return { ok: false, error: `Need ${cost} gold.` };

    const nextPlayers = state.players.map((entry) =>
      entry.id === player.id
        ? {
          ...entry,
          gold: entry.gold - cost
        }
        : entry
    );

    // Displace a peace-partner unit occupying the production tile
    let unitsBeforeProduction = state.units;
    if (occupyingUnit) {
      const productionTile = findTileByKey(state.tiles, tileKey);
      const displaceTo = productionTile
        ? state.tiles
          .filter((t) => axialDistance(productionTile, t) <= 3 && !isTileOccupied(state.units, t.key) && t.key !== tileKey)
          .sort((a, b) => axialDistance(productionTile, a) - axialDistance(productionTile, b))[0]
        : null;
      if (displaceTo) {
        unitsBeforeProduction = state.units.map((u) =>
          u.id === occupyingUnit.id ? { ...u, tileKey: displaceTo.key } : u
        );
      }
    }

    const nextUnits = [
      ...unitsBeforeProduction,
      {
        id: makeId("unit"),
        ownerId: player.id,
        tileKey,
        type: unitType,
        health: UNIT_STATS[unitType].maxHealth,
        hasMovedThisTurn: true,
        hasAttackedThisTurn: false,
        movesUsed: 0
      }
    ];
    const nextFog = revealAroundAllUnits(state.fogOfWar, nextUnits, state.tiles, 1);

    const visibilityPlayerId = options?.visibilityPlayerId ?? null;
    const productionVisible = !visibilityPlayerId ? true : Boolean(state.fogOfWar[visibilityPlayerId]?.[tileKey]);
    const productionLog = productionVisible
      ? `${UNIT_STATS[unitType].name} deployed`
      : "Reinforced hidden positions";

    let nextContactedPlayerIds = state.contactedPlayerIds;
    let nextFirstContactNotification = state.firstContactNotification;
    const productionLogs = [...state.logs, createLog(state.turnNumber, productionLog, player.color)];
    if (state.humanPlayerId && player.id === state.humanPlayerId) {
      const { newIds, newColors } = detectContactsFromFog(
        state.humanPlayerId, state.contactedPlayerIds, state.tiles, nextUnits, nextFog, state.players
      );
      if (newIds.length > 0) {
        nextContactedPlayerIds = [...state.contactedPlayerIds, ...newIds];
        nextFirstContactNotification = newColors[0] ?? null;
        for (const color of newColors) {
          productionLogs.push(createLog(state.turnNumber, `First contact with ${color}`, color));
        }
      }
    }

    set({
      players: nextPlayers,
      units: nextUnits,
      fogOfWar: nextFog,
      contactedPlayerIds: nextContactedPlayerIds,
      firstContactNotification: nextFirstContactNotification,
      logs: productionLogs
    });

    return { ok: true };
  },

  toggleTechTree: (open) =>
    set((state) => ({
      techTreeOpen: typeof open === "boolean" ? open : !state.techTreeOpen
    })),

  dismissFirstContact: () => set({ firstContactNotification: null }),
  dismissDiplomaticNotification: () => set({ diplomaticNotification: null }),
  dismissTreatyAccepted: () => set({ treatyAcceptedNotification: null }),
  dismissReinforcementNotification: () => set({ reinforcementNotification: null }),

  sendReinforcementRequest: (toPlayerId) => {
    const state = get();
    if (!state.currentPlayerId || state.gameOver) return;
    if (state.reinforcementRequest) return;
    if (!arePeacePartners(state.peaceTreaties, state.currentPlayerId, toPlayerId)) return;
    const toColor = state.players.find((p) => p.id === toPlayerId)?.color ?? "blue";
    const fromColor = state.players.find((p) => p.id === state.currentPlayerId)?.color ?? "blue";
    const rr: ReinforcementRequest = {
      id: makeId("rr"),
      fromPlayerId: state.currentPlayerId,
      fromColor,
      toPlayerId,
      toColor,
      turnSent: state.turnNumber,
      status: "pending",
      donatedEntries: [],
      totalGoldCost: 0,
      turnResolved: null
    };
    set({
      reinforcementRequest: rr,
      diplomacyLog: appendDiplomacyLog(
        state.diplomacyLog,
        state.turnNumber,
        `${fromColor} requested reinforcements from ${toColor}`,
        fromColor
      ),
      logs: [...state.logs, createLog(state.turnNumber, `Reinforcement request sent to ${toColor}`, fromColor)]
    });
  },

  respondToReinforcementRequest: (accept) => {
    const state = get();
    const rr = state.reinforcementRequest;
    if (!rr || rr.status !== "pending" || rr.toPlayerId !== state.currentPlayerId) return;
    if (accept) {
      set({
        reinforcementRequest: { ...rr, status: "donating" },
        diplomacyLog: appendDiplomacyLog(
          state.diplomacyLog,
          state.turnNumber,
          `${rr.toColor} accepted reinforcement request from ${rr.fromColor}`,
          rr.toColor
        )
      });
    } else {
      const currentColor = state.players.find((p) => p.id === state.currentPlayerId)?.color ?? "blue";
      set({
        reinforcementRequest: { ...rr, status: "rejected", turnResolved: state.turnNumber },
        diplomacyLog: appendDiplomacyLog(
          state.diplomacyLog,
          state.turnNumber,
          `${rr.toColor} rejected reinforcement request from ${rr.fromColor}`,
          currentColor
        ),
        logs: [...state.logs, createLog(state.turnNumber, `Reinforcement request declined`, currentColor)]
      });
    }
  },

  submitDonation: (entries) => {
    const state = get();
    const rr = state.reinforcementRequest;
    if (!rr || rr.status !== "donating" || rr.toPlayerId !== state.currentPlayerId) return;
    const donorId = rr.toPlayerId;
    const receiverId = rr.fromPlayerId;
    const receiverColor = rr.fromColor;
    const donor = state.players.find((p) => p.id === donorId);
    if (!donor) return;

    const totalCost = entries.reduce((sum, e) => sum + UNIT_STATS[e.unitType].productionCost * e.quantity, 0);
    if (donor.gold < totalCost) return;

    const unitTypeList: UnitType[] = entries.flatMap((e) => Array<UnitType>(e.quantity).fill(e.unitType));
    const spawnTileKeys = findDonationSpawnTiles(receiverId, state.tiles, state.units, unitTypeList.length);

    const newUnits: Unit[] = spawnTileKeys.map((tileKey, i) => ({
      id: makeId("unit"),
      ownerId: receiverId,
      tileKey,
      type: unitTypeList[i],
      health: UNIT_STATS[unitTypeList[i]].maxHealth,
      hasMovedThisTurn: true,
      hasAttackedThisTurn: false,
      movesUsed: 0
    }));

    const actualCount = newUnits.length;
    const donorColor = donor.color;
    const nextPlayers = state.players.map((p) => p.id === donorId ? { ...p, gold: p.gold - totalCost } : p);
    const nextUnits = [...state.units, ...newUnits];
    const nextFog = revealAroundAllUnits(state.fogOfWar, nextUnits, state.tiles, 1);

    const notification = actualCount > 0
      ? `${actualCount} unit${actualCount > 1 ? "s" : ""} sent to ${receiverColor}`
      : "No valid spawn tiles — units could not be delivered";
    const shouldNotify = state.humanPlayerId !== null && (receiverId === state.humanPlayerId || donorId === state.humanPlayerId);

    const newDonorColors = Object.fromEntries(newUnits.map((u) => [u.id, donorColor]));
    set({
      players: nextPlayers,
      units: nextUnits,
      fogOfWar: nextFog,
      reinforcementRequest: { ...rr, status: "accepted", donatedEntries: entries, totalGoldCost: totalCost, turnResolved: state.turnNumber },
      reinforcementNotification: shouldNotify ? notification : null,
      unitDonorColors: { ...state.unitDonorColors, ...newDonorColors },
      diplomacyLog: appendDiplomacyLog(
        state.diplomacyLog,
        state.turnNumber,
        `${donorColor} sent ${actualCount} unit${actualCount > 1 ? "s" : ""} to ${receiverColor}`,
        donorColor
      ),
      logs: [...state.logs, createLog(state.turnNumber,
        `${donorColor} sent ${actualCount} unit${actualCount > 1 ? "s" : ""} to ${receiverColor}`, donorColor)]
    });
  },

  sendPeaceTreaty: (toPlayerId) => {
    const state = get();
    if (!state.humanPlayerId) return;
    if (arePeacePartners(state.peaceTreaties, state.humanPlayerId, toPlayerId)) return;
    if (state.outgoingTreaty) return;
    if (!canSendPeaceOfferNow(state.peaceMemories, state.humanPlayerId, toPlayerId, state.turnNumber)) return;

    const evaluation = evaluatePeaceWillingness({
      selfId: state.humanPlayerId,
      targetId: toPlayerId,
      players: state.players,
      tiles: state.tiles,
      units: state.units,
      villages: state.villages,
      peaceTreaties: state.peaceTreaties,
      memories: state.peaceMemories,
      turnNumber: state.turnNumber
    });
    const offer = buildPeaceOffer(
      state.humanPlayerId,
      toPlayerId,
      state.players,
      evaluation.primaryReason,
      evaluation.score,
      state.turnNumber,
      "human_outgoing"
    );
    if (!offer) return;

    const toColorName = offer.toColor.charAt(0).toUpperCase() + offer.toColor.slice(1);
    set({
      outgoingTreaty: offer,
      peaceMemories: recordPeaceOffer(state.peaceMemories, state.humanPlayerId, toPlayerId, state.turnNumber),
      aiPeaceDebugLog: addPeaceDebugEntry(
        state.aiPeaceDebugLog,
        `[Turn ${state.turnNumber}] ${offer.fromColor} -> ${offer.toColor}: send peace (score ${offer.score})`
      ),
      logs: [...state.logs, createLog(state.turnNumber, `Peace offer sent to ${toColorName}`, offer.toColor)]
    });
  },

  respondToPeaceTreaty: (accept) => {
    const state = get();
    if (!state.pendingPeaceTreaty) return;
    const offer = state.pendingPeaceTreaty;
    const responderColor = state.players.find((p) => p.id === offer.toPlayerId)?.color ?? "blue";
    const logs = [...state.logs];
    const debugEntry = `[Turn ${state.turnNumber}] ${offer.toColor} ${accept ? "accepted" : "rejected"} peace from ${offer.fromColor} (score ${offer.score})`;
    let nextPeaceTreaties = state.peaceTreaties;
    let nextMemories = state.peaceMemories;
    let nextPendingTreatyResult: PeaceResolution | null = null;
    let nextDiplomaticNotification = state.diplomaticNotification;
    let nextTreatyAcceptedNotification = state.treatyAcceptedNotification;

    if (offer.direction === "ai_outgoing") {
      if (accept) {
        nextPeaceTreaties = appendPeaceTreaty(state.peaceTreaties, offer.fromPlayerId, offer.toPlayerId);
        nextTreatyAcceptedNotification = offer.fromColor;
        logs.push(createLog(state.turnNumber, `${offer.fromColor} accepted peace with ${offer.toColor}`, offer.fromColor));
      } else {
        nextMemories = recordPeaceRejection(state.peaceMemories, offer.fromPlayerId, offer.toPlayerId, state.turnNumber);
        nextDiplomaticNotification = `${offer.fromColor.charAt(0).toUpperCase() + offer.fromColor.slice(1)} withdraws after your rejection.`;
        logs.push(createLog(state.turnNumber, `${offer.toColor} rejected peace with ${offer.fromColor}`, responderColor));
      }
    } else {
      nextPendingTreatyResult = {
        accepted: accept,
        fromColor: responderColor,
        toPlayerId: offer.fromPlayerId,
        reason: offer.reason,
        score: offer.score
      };
    }

    set({
      pendingPeaceTreaty: null,
      pendingTreatyResult: nextPendingTreatyResult,
      peaceTreaties: nextPeaceTreaties,
      peaceMemories: nextMemories,
      diplomaticNotification: nextDiplomaticNotification,
      treatyAcceptedNotification: nextTreatyAcceptedNotification,
      aiPeaceDebugLog: addPeaceDebugEntry(state.aiPeaceDebugLog, debugEntry),
      logs
    });
  },

  breakPeaceTreaty: (toPlayerId, options) => {
    const state = get();
    const breakerId = state.currentPlayerId;
    if (!breakerId) return;
    if (!arePeacePartners(state.peaceTreaties, breakerId, toPlayerId)) return;
    const skipActionLock = options?.skipActionLock ?? false;

    // Remove units from the breaker that are in the partner's territory
    const partnerTileKeys = new Set(
      state.tiles.filter((t) => t.ownerId === toPlayerId).map((t) => t.key)
    );
    const nextUnits = state.units.filter(
      (u) => !(u.ownerId === breakerId && partnerTileKeys.has(u.tileKey))
    );

    // Permanently stamp alliance-visible tiles into fogOfWar for both sides so they
    // remain discovered after the treaty is removed.
    const nextFog = { ...state.fogOfWar };
    const partnerOwnedKeys = [...partnerTileKeys];
    if (partnerOwnedKeys.length > 0) {
      const breakerFog = { ...(nextFog[breakerId] ?? {}) };
      for (const key of partnerOwnedKeys) breakerFog[key] = true;
      nextFog[breakerId] = breakerFog;
    }
    const breakerOwnedKeys = state.tiles.filter((t) => t.ownerId === breakerId).map((t) => t.key);
    if (breakerOwnedKeys.length > 0) {
      const partnerFog = { ...(nextFog[toPlayerId] ?? {}) };
      for (const key of breakerOwnedKeys) partnerFog[key] = true;
      nextFog[toPlayerId] = partnerFog;
    }

    const breakerColor = state.players.find((p) => p.id === breakerId)?.color;
    const partnerColor = state.players.find((p) => p.id === toPlayerId)?.color;

    const breakNotice = `${breakerColor ? breakerColor.charAt(0).toUpperCase() + breakerColor.slice(1) : "Someone"} has broken the peace with ${partnerColor ?? "you"}.`;
    // Cancel any reinforcement request involving this peace partner
    const rr = state.reinforcementRequest;
    const clearReinforcement = rr && (rr.toPlayerId === toPlayerId || rr.fromPlayerId === toPlayerId);

    set({
      fogOfWar: nextFog,
      peaceTreaties: state.peaceTreaties.filter(
        (t) => !((t.playerA === breakerId && t.playerB === toPlayerId) || (t.playerA === toPlayerId && t.playerB === breakerId))
      ),
      units: nextUnits,
      justBrokePeace: skipActionLock ? state.justBrokePeace : [...state.justBrokePeace, toPlayerId],
      peaceMemories: recordBrokenPeace(state.peaceMemories, breakerId, toPlayerId, state.turnNumber),
      diplomaticNotification: breakNotice,
      reinforcementRequest: clearReinforcement ? null : state.reinforcementRequest,
      logs: [...state.logs, createLog(state.turnNumber, `${breakerColor} has broken the peace with ${partnerColor}`, breakerColor)]
    });
  },

  healUnit: (unitId) => {
    const state = get();
    if (!state.currentPlayerId || state.gameOver) return { ok: false, error: "No active turn." };

    const unit = state.units.find((u) => u.id === unitId);
    if (!unit || unit.ownerId !== state.currentPlayerId) return { ok: false, error: "Not your unit." };
    if (unit.hasMovedThisTurn) return { ok: false, error: "Unit has already acted this turn." };
    if (state.justBrokePeace.length > 0) return { ok: false, error: "Cannot act after breaking a peace treaty. End your turn." };

    const maxHealth = UNIT_STATS[unit.type].maxHealth;
    if (unit.health >= maxHealth) return { ok: false, error: "Unit is already at full health." };

    const actorColor = state.players.find((p) => p.id === state.currentPlayerId)?.color;
    set({
      units: state.units.map((u) =>
        u.id === unitId ? { ...u, health: u.health + 1, hasMovedThisTurn: true } : u
      ),
      logs: [...state.logs, createLog(state.turnNumber, `${UNIT_STATS[unit.type].name} healed`, actorColor)]
    });
    return { ok: true };
  },

  endTurn: () => {
    const state = get();
    if (state.gameOver || !state.currentPlayerId || state.actionAnimationBusy) return;

    const alivePlayers = state.players.filter((player) => player.isAlive);
    if (alivePlayers.length === 0) return;

    const currentIndex = alivePlayers.findIndex((player) => player.id === state.currentPlayerId);
    const nextIndex = (currentIndex + 1) % alivePlayers.length;
    const nextPlayerId = alivePlayers[nextIndex]?.id ?? null;
    // Round increments only when all players have gone (wrapping back to the first alive player)
    const nextTurn = nextIndex === 0 ? state.turnNumber + 1 : state.turnNumber;

    if (!nextPlayerId) return;

    // Passive regen: units that didn't move or attack regain 1 HP
    const regenUnitIds: string[] = [];
    const regenedUnits = state.units.map((unit) => {
      if (unit.ownerId !== state.currentPlayerId) return unit;
      if (unit.hasMovedThisTurn || unit.hasAttackedThisTurn) return unit;
      const max = UNIT_STATS[unit.type].maxHealth;
      if (unit.health >= max) return unit;
      regenUnitIds.push(unit.id);
      return { ...unit, health: unit.health + 1 };
    });

    const incomeBreakdown = calculateTurnIncome(nextPlayerId, state.tiles, state.villages);
    const incomePlayers = applyTurnIncome(state.players, nextPlayerId, incomeBreakdown.income);
    const refreshedUnits = resetMovementForPlayer(regenedUnits, nextPlayerId);
    const nextFog = revealAroundAllUnits(state.fogOfWar, refreshedUnits, state.tiles, 1);
    const nextPlayerColor = state.players.find((p) => p.id === nextPlayerId)?.color;

    // Faction contact detection: any two factions whose tiles are now adjacent have "met"
    const newContactPairs = detectFactionContacts(state.tiles, state.factionContactPairs);
    const nextFactionContactPairs = newContactPairs.length > 0
      ? [...state.factionContactPairs, ...newContactPairs]
      : state.factionContactPairs;

    // First contact check after fog update (catches contacts from AI movements and turn transitions)
    let nextContactedPlayerIds = state.contactedPlayerIds;
    let nextFirstContactNotification = state.firstContactNotification;
    const nextLogs = [...state.logs, createLog(nextTurn, `+${incomeBreakdown.income} gold`, nextPlayerColor)];
    if (state.humanPlayerId) {
      const { newIds, newColors } = detectContactsFromFog(
        state.humanPlayerId, state.contactedPlayerIds, state.tiles, refreshedUnits, nextFog, state.players
      );
      if (newIds.length > 0) {
        nextContactedPlayerIds = [...state.contactedPlayerIds, ...newIds];
        nextFirstContactNotification = newColors[0] ?? null;
        for (const color of newColors) {
          nextLogs.push(createLog(nextTurn, `First contact with ${color}`, color));
        }
      }
    }

    // ── Diplomacy: process treaty transitions at turn boundaries ──────────
    let outgoingTreaty = state.outgoingTreaty;
    let pendingTreatyResult = state.pendingTreatyResult;
    let pendingPeaceTreaty = state.pendingPeaceTreaty;
    let nextPeaceTreaties = state.peaceTreaties;
    let nextDiplomaticNotification = state.diplomaticNotification;
    let nextTreatyAcceptedNotification = state.treatyAcceptedNotification;
    let nextPeaceMemories = state.peaceMemories;
    let nextAiPeaceDebugLog = state.aiPeaceDebugLog;

    // Case A: transitioning to the treaty recipient — AI evaluates or PvP shows modal
    if (outgoingTreaty && outgoingTreaty.toPlayerId === nextPlayerId && state.humanPlayerId) {
      const isAI = state.aiPlayerIds.includes(nextPlayerId);
      if (isAI) {
        pendingTreatyResult = shouldAcceptPeaceOffer({
          selfId: nextPlayerId,
          targetId: state.humanPlayerId,
          players: incomePlayers,
          tiles: state.tiles,
          units: refreshedUnits,
          villages: state.villages,
          peaceTreaties: nextPeaceTreaties,
          memories: nextPeaceMemories,
          turnNumber: nextTurn
        });
        nextAiPeaceDebugLog = addPeaceDebugEntry(
          nextAiPeaceDebugLog,
          `[Turn ${nextTurn}] ${outgoingTreaty.toColor} evaluates human peace: score ${pendingTreatyResult.score} -> ${pendingTreatyResult.accepted ? "accept" : "reject"}`
        );
      } else {
        pendingPeaceTreaty = outgoingTreaty;
      }
    }

    // Case B: transitioning back to the sender — deliver the queued result
    if (pendingTreatyResult && nextPlayerId === state.humanPlayerId && outgoingTreaty) {
      const { accepted, fromColor, reason, score } = pendingTreatyResult;
      const colorName = fromColor.charAt(0).toUpperCase() + fromColor.slice(1);
      if (accepted && state.humanPlayerId) {
        nextPeaceTreaties = appendPeaceTreaty(state.peaceTreaties, state.humanPlayerId, outgoingTreaty.toPlayerId);
        nextTreatyAcceptedNotification = fromColor;
        nextLogs.push(createLog(nextTurn, `${colorName} accepted the peace treaty`, fromColor));
      } else {
        nextDiplomaticNotification = `${colorName} rejected the peace offer.`;
        nextLogs.push(createLog(nextTurn, `${colorName} rejected the peace treaty`, fromColor));
        nextPeaceMemories = recordPeaceRejection(nextPeaceMemories, outgoingTreaty.fromPlayerId, outgoingTreaty.toPlayerId, nextTurn);
      }
      nextAiPeaceDebugLog = addPeaceDebugEntry(
        nextAiPeaceDebugLog,
        `[Turn ${nextTurn}] ${fromColor} responds to ${outgoingTreaty.fromColor}: ${accepted ? "accept" : "reject"} (score ${score}, ${reason})`
      );
      outgoingTreaty = null;
      pendingTreatyResult = null;
    }

    nextPeaceMemories = updatePeaceMemories(
      nextPeaceMemories,
      incomePlayers,
      state.tiles,
      refreshedUnits,
      state.villages,
      nextTurn
    );

    // ── Reinforcement requests: process at turn boundaries ────────────────
    let nextReinforcementRequest = state.reinforcementRequest;
    let nextReinforcementNotification = state.reinforcementNotification;

    // If the donor ends their turn while mid-donation (without submitting) → auto-reject
    if (nextReinforcementRequest?.status === "donating" && nextReinforcementRequest.toPlayerId === state.currentPlayerId) {
      nextReinforcementRequest = { ...nextReinforcementRequest, status: "rejected", turnResolved: state.turnNumber };
    }

    // Deliver result to the requester when it becomes their turn
    if (
      nextReinforcementRequest?.fromPlayerId === nextPlayerId &&
      (nextReinforcementRequest.status === "accepted" || nextReinforcementRequest.status === "rejected")
    ) {
      const { status, toColor, donatedEntries } = nextReinforcementRequest;
      const colorName = toColor.charAt(0).toUpperCase() + toColor.slice(1);
      if (status === "accepted") {
        const unitSummary = donatedEntries.length > 0
          ? donatedEntries.map((e) => `${e.quantity} ${UNIT_STATS[e.unitType].name}${e.quantity > 1 ? "s" : ""}`).join(", ")
          : "reinforcements";
        nextReinforcementNotification = nextReinforcementRequest.fromPlayerId === state.humanPlayerId
          ? `Reinforcements from ${colorName} have arrived! (${unitSummary})`
          : null;
      } else {
        nextReinforcementNotification = nextReinforcementRequest.fromPlayerId === state.humanPlayerId
          ? `${colorName} declined your reinforcement request.`
          : null;
      }
      nextReinforcementRequest = null;
    }

    set({
      players: incomePlayers,
      units: refreshedUnits,
      currentPlayerId: nextPlayerId,
      fogOfWar: nextFog,
      turnNumber: nextTurn,
      selectedTileKey: null,
      hoveredTileKey: null,
      selectedUnitId: null,
      actionAnimationBusy: false,
      pendingAnimatedAction: null,
      aiTurnInProgress: false,
      gameOver: state.gameOver,
      gameOverReason: state.gameOverReason,
      ranking: state.ranking,
      justBrokePeace: [],
      regenAnimUnitIds: regenUnitIds,
      contactedPlayerIds: nextContactedPlayerIds,
      factionContactPairs: nextFactionContactPairs,
      firstContactNotification: nextFirstContactNotification,
      peaceTreaties: nextPeaceTreaties,
      outgoingTreaty,
      pendingTreatyResult,
      pendingPeaceTreaty,
      peaceMemories: nextPeaceMemories,
      aiPeaceDebugLog: nextAiPeaceDebugLog,
      diplomaticNotification: nextDiplomaticNotification,
      treatyAcceptedNotification: nextTreatyAcceptedNotification,
      reinforcementRequest: nextReinforcementRequest,
      reinforcementNotification: nextReinforcementNotification,
      logs: nextLogs
    });
  },

  runAITurn: async () => {
    const state = get();
    if (
      state.gameOver ||
      !state.currentPlayerId ||
      state.aiTurnInProgress ||
      !state.aiPlayerIds.includes(state.currentPlayerId)
    ) {
      return;
    }

    set({ aiTurnInProgress: true });

    await new Promise((resolve) => window.setTimeout(resolve, 320));

    const snapshot = get();
    if (!snapshot.currentPlayerId) {
      set({ aiTurnInProgress: false });
      return;
    }

    const aiPlayerId = snapshot.currentPlayerId;
    const aiDifficulty = snapshot.setup.aiDifficulty;
    const aiSettings = AI_DIFFICULTY_SETTINGS[aiDifficulty];
    const visibilityPlayerId = snapshot.setup.gameMode === "pvai" ? "player_1" : null;

    // ── AI diplomacy phase: propose strategic peace before acting ──────────
    {
      const current = get();
      const aiPlayer = current.players.find((player) => player.id === aiPlayerId);
      if (aiPlayer) {
        const enemies = current.players.filter((player) =>
          player.isAlive &&
          player.id !== aiPlayerId &&
          !arePeacePartners(current.peaceTreaties, aiPlayerId, player.id) &&
          current.factionContactPairs.includes(getFactionPairKey(aiPlayerId, player.id))
        );

        const candidates = enemies
          .filter((enemy) => canSendPeaceOfferNow(current.peaceMemories, aiPlayerId, enemy.id, current.turnNumber))
          .filter((enemy) => {
            if (!current.outgoingTreaty) return true;
            return current.outgoingTreaty.fromPlayerId !== aiPlayerId &&
              current.outgoingTreaty.toPlayerId !== aiPlayerId &&
              current.outgoingTreaty.toPlayerId !== enemy.id;
          })
          .map((enemy) => ({
            enemy,
            result: shouldSendPeaceOffer({
              selfId: aiPlayerId,
              targetId: enemy.id,
              players: current.players,
              tiles: current.tiles,
              units: current.units,
              villages: current.villages,
              peaceTreaties: current.peaceTreaties,
              memories: current.peaceMemories,
              turnNumber: current.turnNumber
            })
          }))
          .sort((a, b) => b.result.evaluation.score - a.result.evaluation.score);

        const chosen = candidates.find((candidate) => candidate.result.shouldSend);
        if (chosen) {
          const offer = buildPeaceOffer(
            aiPlayerId,
            chosen.enemy.id,
            current.players,
            chosen.result.evaluation.primaryReason,
            chosen.result.evaluation.score,
            current.turnNumber,
            "ai_outgoing"
          );

          if (offer) {
            const debugText = `[Turn ${current.turnNumber}] ${offer.fromColor} -> ${offer.toColor}: peace score ${offer.score}, decision send (${offer.reason})`;
            console.debug(debugText);

            if (current.humanPlayerId === chosen.enemy.id && !current.pendingPeaceTreaty) {
              set({
                pendingPeaceTreaty: offer,
                peaceMemories: recordPeaceOffer(current.peaceMemories, aiPlayerId, chosen.enemy.id, current.turnNumber),
                aiPeaceDebugLog: addPeaceDebugEntry(current.aiPeaceDebugLog, debugText),
                logs: [...current.logs, createLog(current.turnNumber, `${offer.fromColor} proposes peace to ${offer.toColor}`, offer.fromColor)]
              });
            } else if (chosen.enemy.id !== current.humanPlayerId) {
              const resolution = shouldAcceptPeaceOffer({
                selfId: chosen.enemy.id,
                targetId: aiPlayerId,
                players: current.players,
                tiles: current.tiles,
                units: current.units,
                villages: current.villages,
                peaceTreaties: current.peaceTreaties,
                memories: current.peaceMemories,
                turnNumber: current.turnNumber
              });

              const accepted = resolution.accepted;
              const updatedMemories = accepted
                ? recordPeaceOffer(current.peaceMemories, aiPlayerId, chosen.enemy.id, current.turnNumber)
                : recordPeaceRejection(
                  recordPeaceOffer(current.peaceMemories, aiPlayerId, chosen.enemy.id, current.turnNumber),
                  aiPlayerId,
                  chosen.enemy.id,
                  current.turnNumber
                );
              const extraDebug = `[Turn ${current.turnNumber}] ${chosen.enemy.color} ${accepted ? "accepted" : "rejected"} AI peace from ${offer.fromColor} (score ${resolution.score})`;
              console.debug(extraDebug);

              set({
                peaceTreaties: accepted
                  ? appendPeaceTreaty(current.peaceTreaties, aiPlayerId, chosen.enemy.id)
                  : current.peaceTreaties,
                peaceMemories: updatedMemories,
                aiPeaceDebugLog: addPeaceDebugEntry(
                  addPeaceDebugEntry(current.aiPeaceDebugLog, debugText),
                  extraDebug
                ),
                logs: [
                  ...current.logs,
                  createLog(
                    current.turnNumber,
                    accepted
                      ? `${offer.fromColor} and ${offer.toColor} agreed to a peace treaty`
                      : `${offer.toColor} refused ${offer.fromColor}'s peace offer`,
                    accepted ? offer.fromColor : offer.toColor
                  )
                ]
              });
            }
          }
        }
      }
    }

    // ── AI: handle incoming pending reinforcement request ──────────────────
    {
      const current = get();
      const rr = current.reinforcementRequest;
      if (rr && rr.status === "pending" && rr.toPlayerId === aiPlayerId) {
        const aiPlayer = current.players.find((p) => p.id === aiPlayerId);
        const accepted = aiPlayer
          ? evaluateAIDonationDecision(aiPlayerId, rr.fromPlayerId, current.tiles, current.units, current.players, aiDifficulty)
          : false;
        if (accepted && aiPlayer) {
          const donationEntries = pickAIDonationUnits(aiPlayer, aiDifficulty);
          const unitTypeList: UnitType[] = donationEntries.flatMap((e) => Array<UnitType>(e.quantity).fill(e.unitType));
          const spawnTileKeys = findDonationSpawnTiles(rr.fromPlayerId, current.tiles, current.units, unitTypeList.length);
          const donatedUnits: Unit[] = spawnTileKeys.map((tileKey, i) => ({
            id: makeId("unit"),
            ownerId: rr.fromPlayerId,
            tileKey,
            type: unitTypeList[i],
            health: UNIT_STATS[unitTypeList[i]].maxHealth,
            hasMovedThisTurn: true,
            hasAttackedThisTurn: false,
            movesUsed: 0
          }));
          const totalCost = donationEntries.reduce((sum, e) => sum + UNIT_STATS[e.unitType].productionCost * e.quantity, 0);
          const nextPlayers = current.players.map((p) => p.id === aiPlayerId ? { ...p, gold: p.gold - totalCost } : p);
          const nextUnits = [...current.units, ...donatedUnits];
          const nextFog = revealAroundAllUnits(current.fogOfWar, nextUnits, current.tiles, 1);
          const actualCount = donatedUnits.length;
          const aiDonorColors = Object.fromEntries(donatedUnits.map((u) => [u.id, aiPlayer.color]));
          set({
            players: nextPlayers,
            units: nextUnits,
            fogOfWar: nextFog,
            reinforcementRequest: { ...rr, status: "accepted", donatedEntries: donationEntries, totalGoldCost: totalCost, turnResolved: current.turnNumber },
            unitDonorColors: { ...current.unitDonorColors, ...aiDonorColors },
            diplomacyLog: appendDiplomacyLog(
              current.diplomacyLog,
              current.turnNumber,
              `${aiPlayer.color} sent ${actualCount} unit${actualCount > 1 ? "s" : ""} to ${rr.fromColor}`,
              aiPlayer.color
            ),
            logs: [...current.logs, createLog(current.turnNumber,
              `${aiPlayer.color} sends ${actualCount} unit${actualCount > 1 ? "s" : ""} as reinforcements`, aiPlayer.color)]
          });
        } else {
          set({
            reinforcementRequest: { ...rr, status: "rejected", turnResolved: current.turnNumber },
            diplomacyLog: appendDiplomacyLog(
              current.diplomacyLog,
              current.turnNumber,
              `${rr.toColor} rejected reinforcement request from ${rr.fromColor}`,
              rr.toColor
            )
          });
        }
      }
    }

    let hiddenActionCount = 0;
    let produced = 0;
    let explorationActions = 0;
    const localHiddenTileKeys: string[] = [];
    const defaultActivity: AIActivityState = {
      turnsWithoutProduction: 0,
      turnsWithoutExploration: 0,
      turnsBoxedIn: 0,
      turnsBelowTargetArmy: 0,
      lastStrategicMode: null
    };
    const waitVisibleAction = async () => {
      await new Promise((resolve) => window.setTimeout(resolve, aiSettings.visibleActionDelayMs));
    };
    const canSpawnAtLeastOne = (tiles: Tile[], units: Unit[]) =>
      tiles.some((tile) =>
        tile.ownerId === aiPlayerId &&
        (tile.isCapital || tile.villageId !== null) &&
        !isTileOccupied(units, tile.key)
      );
    const buildAISnapshot = (current: ReturnType<typeof get>) => ({
      playerId: aiPlayerId,
      players: current.players,
      tiles: current.tiles,
      units: current.units,
      villages: current.villages,
      discovered: current.fogOfWar[aiPlayerId] ?? {},
      difficulty: aiDifficulty,
      mapSize: current.setup.mapSize,
      peaceTreaties: current.peaceTreaties
    });
    const getAIActivity = (current: ReturnType<typeof get>) =>
      current.aiActivityByPlayer[aiPlayerId] ?? defaultActivity;
    const analyzeAI = (current: ReturnType<typeof get>) => {
      const snapshotForAI = buildAISnapshot(current);
      const activity = getAIActivity(current);
      const mode = evaluateStrategicMode(snapshotForAI, activity);
      const desiredArmySize = evaluateDesiredArmySize(snapshotForAI, mode, activity);
      const expansionPressure = evaluateExpansionPressure(snapshotForAI);
      return { snapshotForAI, activity, mode, desiredArmySize, expansionPressure };
    };

    // ── AI reinforcement request: ask allies before rebuilding if desperate ──
    {
      const current = get();
      const aiPlayer = current.players.find((player) => player.id === aiPlayerId);
      const analysis = analyzeAI(current);
      if (aiPlayer && !current.reinforcementRequest) {
        const requestEval = shouldRequestReinforcements(analysis.snapshotForAI, analysis.activity);
        if (requestEval.shouldRequest) {
          const allies = current.peaceTreaties
            .filter((treaty) => treaty.playerA === aiPlayerId || treaty.playerB === aiPlayerId)
            .map((treaty) => (treaty.playerA === aiPlayerId ? treaty.playerB : treaty.playerA))
            .filter((allyId) => current.factionContactPairs.includes(getFactionPairKey(aiPlayerId, allyId)))
            .map((allyId) => current.players.find((player) => player.id === allyId))
            .filter((player): player is Player => Boolean(player))
            .sort((a, b) => {
              const unitDelta = current.units.filter((unit) => unit.ownerId === b.id).length -
                current.units.filter((unit) => unit.ownerId === a.id).length;
              if (unitDelta !== 0) return unitDelta;
              return b.gold - a.gold;
            });

          for (const ally of allies) {
            const cooldownKey = `${aiPlayerId}:${ally.id}`;
            const lastRequest = current.reinforcementCooldowns[cooldownKey] ?? 0;
            if (current.turnNumber - lastRequest < REINFORCEMENT_COOLDOWN_TURNS) continue;
            const rr: ReinforcementRequest = {
              id: makeId("rr"),
              fromPlayerId: aiPlayerId,
              fromColor: aiPlayer.color,
              toPlayerId: ally.id,
              toColor: ally.color,
              turnSent: current.turnNumber,
              status: "pending",
              donatedEntries: [],
              totalGoldCost: 0,
              turnResolved: null
            };
            set({
              reinforcementRequest: rr,
              reinforcementCooldowns: { ...current.reinforcementCooldowns, [cooldownKey]: current.turnNumber },
              diplomacyLog: appendDiplomacyLog(
                current.diplomacyLog,
                current.turnNumber,
                `${aiPlayer.color} requested reinforcements from ${ally.color}`,
                aiPlayer.color
              ),
              logs: [...current.logs, createLog(current.turnNumber, `${aiPlayer.color} requests reinforcements from ${ally.color}`, aiPlayer.color)]
            });
            break;
          }
        }
      }
    }

    for (let i = 0; i < aiSettings.maxTechUnlocksPerTurn; i += 1) {
      const current = get();
      const aiPlayer = current.players.find((player) => player.id === aiPlayerId);
      if (!aiPlayer) break;
      const analysis = analyzeAI(current);
      const currentArmyCount = current.units.filter((unit) => unit.ownerId === aiPlayerId).length;
      const tech = pickBestAvailableTechForAI(aiPlayer);
      if (!tech) break;
      const needsArmyNow = currentArmyCount < analysis.desiredArmySize;
      const minimumUnitReserve = UNIT_STATS.basic_soldier.productionCost;
      if (needsArmyNow && aiPlayer.gold - tech.cost < minimumUnitReserve && canSpawnAtLeastOne(current.tiles, current.units)) {
        break;
      }
      const unlock = get().unlockTech(tech.id);
      if (!unlock.ok) break;
    }

    const runProductionPhase = async (maxAdditional: number, forcedUrgency = 0) => {
      let producedInPhase = 0;
      while (producedInPhase < maxAdditional && produced < aiSettings.maxProductionPerTurn) {
        const current = get();
        const aiPlayer = current.players.find((player) => player.id === aiPlayerId);
        if (!aiPlayer) break;

        const analysis = analyzeAI(current);
        const ownedUnits = current.units.filter((unit) => unit.ownerId === aiPlayerId);
        const ownedArmyCount = ownedUnits.length;
        const canAffordAnyUnit = aiPlayer.gold >= UNIT_STATS.basic_soldier.productionCost;
        if (!canAffordAnyUnit) break;

        const underTarget = ownedArmyCount < analysis.desiredArmySize;
        const urgency =
          forcedUrgency +
          (underTarget ? 3 : 0) +
          analysis.activity.turnsWithoutProduction +
          analysis.activity.turnsBelowTargetArmy +
          (analysis.expansionPressure.isBoxedIn ? 1 : 0) +
          (analysis.mode === "Desperation" ? 2 : analysis.mode === "Preparation" ? 1 : 0);

        if (!underTarget && urgency <= 0 && Math.random() > aiSettings.productionChance) break;

        const capitalTile = current.tiles.find((tile) => tile.ownerId === aiPlayerId && tile.isCapital);
        const discovered = current.fogOfWar[aiPlayerId] ?? {};
        const visibleEnemies = current.units.filter((unit) => unit.ownerId !== aiPlayerId && discovered[unit.tileKey]);
        let capitalThreat = 0;
        if (capitalTile) {
          for (const enemy of visibleEnemies) {
            const enemyTile = current.tiles.find((tile) => tile.key === enemy.tileKey);
            if (enemyTile && axialDistance(capitalTile, enemyTile) <= 5) capitalThreat += 1;
          }
        }

        const unitType = chooseAIUnitTypeToProduce(
          aiPlayer,
          aiDifficulty,
          ownedUnits,
          capitalThreat,
          analysis.mode,
          analysis.activity.turnsWithoutExploration + (analysis.expansionPressure.unexploredFrontierScore > 0 ? 1 : 0)
        );
        if (!unitType) break;
        const spawnTile = chooseAISpawnTile(current.tiles, current.units, aiPlayerId, discovered, unitType);
        if (!spawnTile) break;

        const producedUnit = get().produceUnit(unitType, spawnTile.key, { visibilityPlayerId });
        if (!producedUnit.ok) break;
        if (visibilityPlayerId && !current.fogOfWar[visibilityPlayerId]?.[spawnTile.key]) {
          hiddenActionCount += 1;
          localHiddenTileKeys.push(spawnTile.key);
        } else {
          await waitVisibleAction();
        }

        produced += 1;
        producedInPhase += 1;
      }
    };

    await runProductionPhase(aiSettings.maxProductionPerTurn);

    // ── Strategic betrayal: boxed-in AI can break peace if expansion is blocked ──
    {
      const current = get();
      const analysis = analyzeAI(current);
      if (analysis.mode === "Preparation" || analysis.expansionPressure.isBoxedIn) {
        const candidates = current.peaceTreaties
          .filter((treaty) => treaty.playerA === aiPlayerId || treaty.playerB === aiPlayerId)
          .map((treaty) => (treaty.playerA === aiPlayerId ? treaty.playerB : treaty.playerA))
          .map((targetId) => ({
            targetId,
            result: shouldBreakPeace(
              analysis.snapshotForAI,
              targetId,
              analysis.activity,
              current.peaceMemories[getDiplomacyPairKey(aiPlayerId, targetId)]?.trustPenalty ?? 0
            )
          }))
          .sort((a, b) => b.result.score - a.result.score);

        const target = candidates.find((candidate) => candidate.result.shouldBreak);
        if (target) {
          console.debug(`[Turn ${current.turnNumber}] AI breaks peace: ${aiPlayerId} -> ${target.targetId} (score ${target.result.score})`);
          get().breakPeaceTreaty(target.targetId, { skipActionLock: true });
        }
      }
    }

    const maxMoves = Math.max(2, get().units.filter((unit) => unit.ownerId === aiPlayerId).length + 1);
    for (let moveIndex = 0; moveIndex < maxMoves; moveIndex += 1) {
      const current = get();
      if (current.currentPlayerId !== aiPlayerId) break;
      const analysis = analyzeAI(current);

      const choice = chooseAIMove({
        ...analysis.snapshotForAI,
        strategicMode: analysis.mode
      });
      if (!choice) break;

      const beforeTile = current.tiles.find((tile) => tile.key === choice.targetTileKey);
      const wasExplorationMove = Boolean(
        beforeTile &&
        (
          beforeTile.ownerId === null ||
          current.tiles.some((neighbor) =>
            axialDistance(beforeTile, neighbor) === 1 && !analysis.snapshotForAI.discovered[neighbor.key]
          )
        )
      );

      const action = get().attemptUnitAction(choice.unitId, choice.targetTileKey, { visibilityPlayerId });
      if (!action.ok) break;

      if (wasExplorationMove) explorationActions += 1;

      if (action.actionVisible) {
        await waitVisibleAction();
      } else {
        hiddenActionCount += 1;
        localHiddenTileKeys.push(choice.targetTileKey);
      }
    }

    // Heal any remaining unacted wounded units
    {
      const healCurrent = get();
      const woundedUnacted = healCurrent.units.filter(
        (u) => u.ownerId === aiPlayerId && !u.hasMovedThisTurn && u.health < UNIT_STATS[u.type].maxHealth
      );
      for (const u of woundedUnacted) {
        get().healUnit(u.id);
      }
    }

    const remainingProduction = aiSettings.maxProductionPerTurn - produced;
    if (remainingProduction > 0) {
      const latestAnalysis = analyzeAI(get());
      const urgencyBoost =
        (produced === 0 ? 2 : 0) +
        latestAnalysis.activity.turnsWithoutProduction +
        (latestAnalysis.snapshotForAI.units.filter((unit) => unit.ownerId === aiPlayerId).length < latestAnalysis.desiredArmySize ? 2 : 0);
      await runProductionPhase(remainingProduction, urgencyBoost);
    }

    if (hiddenActionCount > 0 && visibilityPlayerId) {
      const latest = get();
      set({
        logs: [...latest.logs, createLog(latest.turnNumber, "Enemy movement detected")]
      });
    }

    {
      const current = get();
      const analysis = analyzeAI(current);
      const finalArmySize = current.units.filter((unit) => unit.ownerId === aiPlayerId).length;
      const nextActivity: AIActivityState = {
        turnsWithoutProduction: produced > 0 ? 0 : analysis.activity.turnsWithoutProduction + 1,
        turnsWithoutExploration: explorationActions > 0 ? 0 : analysis.activity.turnsWithoutExploration + 1,
        turnsBoxedIn: analysis.expansionPressure.isBoxedIn ? analysis.activity.turnsBoxedIn + 1 : 0,
        turnsBelowTargetArmy: finalArmySize < analysis.desiredArmySize ? analysis.activity.turnsBelowTargetArmy + 1 : 0,
        lastStrategicMode: analysis.mode
      };
      set({
        aiActivityByPlayer: {
          ...current.aiActivityByPlayer,
          [aiPlayerId]: nextActivity
        }
      });
    }

    get().endTurn();
    set({ aiTurnInProgress: false, hiddenMoveTileKeys: localHiddenTileKeys });
    if (localHiddenTileKeys.length > 0) {
      window.setTimeout(() => set({ hiddenMoveTileKeys: [] }), 2000);
    }
  }
}));

export const useTileCount = (playerId: string) => useGameStore((state) => countOwnedTiles(state.tiles, playerId));
