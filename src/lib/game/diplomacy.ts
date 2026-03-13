import { axialDistance } from "@/lib/game/map";
import { UNIT_STATS } from "@/lib/game/unitSystem";
import type {
  DiplomacyPersonality,
  PeacePairMemory,
  PeaceResolution,
  PeaceTreaty,
  Player,
  Tile,
  Unit,
  Village
} from "@/lib/game/types";

type PairCounts = {
  tileCount: number;
  unitCount: number;
  villageCount: number;
};

type PeaceReason = {
  key: string;
  text: string;
  weight: number;
};

export type PeaceEvaluation = {
  score: number;
  reasons: PeaceReason[];
  primaryReason: string;
  personality: DiplomacyPersonality;
};

type PeaceContext = {
  selfId: string;
  targetId: string;
  players: Player[];
  tiles: Tile[];
  units: Unit[];
  villages: Village[];
  peaceTreaties: PeaceTreaty[];
  memories: Record<string, PeacePairMemory>;
  turnNumber: number;
};

const SELF_CAPITAL_RADIUS = 5;
const ENEMY_CAPITAL_PRESSURE_RADIUS = 4;
const PERSONALITY_BY_SLOT: DiplomacyPersonality[] = ["aggressive", "balanced", "defensive", "opportunistic"];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const unitPower = (unit: Unit) => {
  const stats = UNIT_STATS[unit.type];
  return stats.productionCost + stats.damage * 3 + unit.health * 2 + stats.attackRange * 2;
};

const getTileMap = (tiles: Tile[]) => new Map(tiles.map((tile) => [tile.key, tile]));

const getCountsByPlayer = (players: Player[], tiles: Tile[], units: Unit[], villages: Village[]) => {
  const counts: Record<string, PairCounts> = {};
  for (const player of players) {
    counts[player.id] = {
      tileCount: tiles.filter((tile) => tile.ownerId === player.id).length,
      unitCount: units.filter((unit) => unit.ownerId === player.id).length,
      villageCount: villages.filter((village) => village.ownerId === player.id).length
    };
  }
  return counts;
};

export const getDiplomacyPairKey = (a: string, b: string) => [a, b].sort().join(":");

const getOrderedCounts = (
  key: string,
  playerId: string,
  targetId: string,
  counts: Record<string, PairCounts>
) => {
  const [playerA, playerB] = key.split(":");
  const selfCounts = counts[playerId] ?? { tileCount: 0, unitCount: 0, villageCount: 0 };
  const targetCounts = counts[targetId] ?? { tileCount: 0, unitCount: 0, villageCount: 0 };
  return {
    playerA,
    playerB,
    playerATileCount: playerA === playerId ? selfCounts.tileCount : targetCounts.tileCount,
    playerBTileCount: playerB === playerId ? selfCounts.tileCount : targetCounts.tileCount,
    playerAUnitCount: playerA === playerId ? selfCounts.unitCount : targetCounts.unitCount,
    playerBUnitCount: playerB === playerId ? selfCounts.unitCount : targetCounts.unitCount,
    playerAVillageCount: playerA === playerId ? selfCounts.villageCount : targetCounts.villageCount,
    playerBVillageCount: playerB === playerId ? selfCounts.villageCount : targetCounts.villageCount
  };
};

export const getAIPersonality = (playerId: string) => {
  const numeric = Number.parseInt(playerId.replace(/\D/g, ""), 10);
  const slot = Number.isNaN(numeric) ? playerId.length : numeric;
  return PERSONALITY_BY_SLOT[slot % PERSONALITY_BY_SLOT.length] ?? "balanced";
};

const arePeacePartners = (peaceTreaties: PeaceTreaty[], a: string, b: string) =>
  peaceTreaties.some((entry) =>
    (entry.playerA === a && entry.playerB === b) || (entry.playerA === b && entry.playerB === a)
  );

const computeFrontPressure = (
  aggressorId: string,
  defenderId: string,
  tiles: Tile[],
  units: Unit[]
) => {
  const tileMap = getTileMap(tiles);
  const defenderCapital = tiles.find((tile) => tile.isCapital && tile.ownerId === defenderId);
  const aggressorCapital = tiles.find((tile) => tile.isCapital && tile.ownerId === aggressorId);
  const aggressorUnits = units.filter((unit) => unit.ownerId === aggressorId);

  let pressure = 0;
  for (const unit of aggressorUnits) {
    const unitTile = tileMap.get(unit.tileKey);
    if (!unitTile) continue;
    if (defenderCapital) {
      const dist = axialDistance(unitTile, defenderCapital);
      if (dist <= ENEMY_CAPITAL_PRESSURE_RADIUS) {
        pressure += Math.max(1, ENEMY_CAPITAL_PRESSURE_RADIUS + 1 - dist);
      }
    }
    const borderEnemyTile = tiles.find((tile) => tile.ownerId === defenderId && axialDistance(tile, unitTile) <= 2);
    if (borderEnemyTile) pressure += 1;
    if (aggressorCapital && axialDistance(unitTile, aggressorCapital) <= 2 && defenderCapital) {
      pressure -= 0.5;
    }
  }

  return pressure;
};

export const militaryPressureScore = (
  selfId: string,
  targetId: string,
  tiles: Tile[],
  units: Unit[]
) => {
  const tileMap = getTileMap(tiles);
  const selfCapital = tiles.find((tile) => tile.isCapital && tile.ownerId === selfId);
  const targetUnits = units.filter((unit) => unit.ownerId === targetId);
  const selfUnits = units.filter((unit) => unit.ownerId === selfId);

  let danger = 0;
  if (selfCapital) {
    for (const enemy of targetUnits) {
      const enemyTile = tileMap.get(enemy.tileKey);
      if (!enemyTile) continue;
      const dist = axialDistance(enemyTile, selfCapital);
      if (dist <= SELF_CAPITAL_RADIUS) {
        danger += Math.max(1, SELF_CAPITAL_RADIUS + 1 - dist);
      }
    }
  }

  const friendlyScreen = selfUnits.reduce((total, unit) => {
    const tile = tileMap.get(unit.tileKey);
    if (!tile || !selfCapital) return total;
    return axialDistance(tile, selfCapital) <= 3 ? total + 1 : total;
  }, 0);

  return Math.max(0, danger - friendlyScreen * 0.5);
};

const activeWarCountFor = (selfId: string, players: Player[], peaceTreaties: PeaceTreaty[]) =>
  players.filter((player) => player.isAlive && player.id !== selfId && !arePeacePartners(peaceTreaties, selfId, player.id)).length;

export const trustPenaltyBetweenFactions = (
  memories: Record<string, PeacePairMemory>,
  a: string,
  b: string
) => memories[getDiplomacyPairKey(a, b)]?.trustPenalty ?? 0;

export const acceptanceProbabilityFromScore = (score: number) => {
  if (score >= 75) return 0.95;
  if (score >= 45) return 0.78;
  if (score >= 15) return 0.58;
  if (score >= -15) return 0.42;
  if (score >= -45) return 0.2;
  return 0.05;
};

export const proposalProbabilityFromScore = (score: number) => {
  if (score >= 85) return 0.72;
  if (score >= 55) return 0.48;
  if (score >= 30) return 0.26;
  if (score >= 10) return 0.12;
  return 0;
};

export const evaluatePeaceWillingness = ({
  selfId,
  targetId,
  players,
  tiles,
  units,
  villages,
  peaceTreaties,
  memories,
  turnNumber
}: PeaceContext): PeaceEvaluation => {
  const self = players.find((player) => player.id === selfId);
  const target = players.find((player) => player.id === targetId);
  if (!self || !target) {
    return {
      score: 0,
      reasons: [],
      primaryReason: "They are watching the frontier.",
      personality: "balanced"
    };
  }

  const pairKey = getDiplomacyPairKey(selfId, targetId);
  const memory = memories[pairKey];
  const personality = getAIPersonality(selfId);
  const tileMap = getTileMap(tiles);
  const selfUnits = units.filter((unit) => unit.ownerId === selfId);
  const targetUnits = units.filter((unit) => unit.ownerId === targetId);
  const selfPower = selfUnits.reduce((total, unit) => total + unitPower(unit), 0);
  const targetPower = targetUnits.reduce((total, unit) => total + unitPower(unit), 0);
  const selfCounts = {
    tileCount: tiles.filter((tile) => tile.ownerId === selfId).length,
    unitCount: selfUnits.length,
    villageCount: villages.filter((village) => village.ownerId === selfId).length
  };
  const targetCounts = {
    tileCount: tiles.filter((tile) => tile.ownerId === targetId).length,
    unitCount: targetUnits.length,
    villageCount: villages.filter((village) => village.ownerId === targetId).length
  };
  const selfCapital = tiles.find((tile) => tile.isCapital && tile.ownerId === selfId);
  const targetCapital = tiles.find((tile) => tile.isCapital && tile.ownerId === targetId);
  const selfPressure = militaryPressureScore(selfId, targetId, tiles, units);
  const targetPressure = militaryPressureScore(targetId, selfId, tiles, units);
  const selfOffensivePressure = computeFrontPressure(selfId, targetId, tiles, units);
  const targetOffensivePressure = computeFrontPressure(targetId, selfId, tiles, units);
  const activeWars = activeWarCountFor(selfId, players, peaceTreaties);
  const trustPenalty = trustPenaltyBetweenFactions(memories, selfId, targetId);
  const stallTurns = memory ? Math.max(0, turnNumber - memory.lastMeaningfulChangeTurn) : 0;
  const otherEnemyPressure = players
    .filter((player) => player.isAlive && player.id !== selfId && player.id !== targetId && !arePeacePartners(peaceTreaties, selfId, player.id))
    .reduce((highest, player) => Math.max(highest, militaryPressureScore(selfId, player.id, tiles, units)), 0);

  const reasons: PeaceReason[] = [];
  const pushReason = (key: string, text: string, weight: number) => {
    if (Math.abs(weight) < 0.5) return;
    reasons.push({ key, text, weight });
  };

  let score = 0;

  const powerDelta = selfPower - targetPower;
  if (powerDelta < -30) {
    const weight = clamp(Math.abs(powerDelta) / 9, 8, 24);
    score += weight;
    pushReason("losing_war", "They want to stop a losing war.", weight);
  } else if (powerDelta > 30) {
    const weight = clamp(powerDelta / 10, 6, 22);
    score -= weight;
    pushReason("winning_war", "They believe victory is still within reach.", -weight);
  }

  if (selfCounts.unitCount + 1 < targetCounts.unitCount) {
    const weight = clamp((targetCounts.unitCount - selfCounts.unitCount) * 4, 6, 18);
    score += weight;
    pushReason("outnumbered", "They are outnumbered near this war.", weight);
  } else if (selfCounts.unitCount > targetCounts.unitCount + 1) {
    const weight = clamp((selfCounts.unitCount - targetCounts.unitCount) * 3, 5, 16);
    score -= weight;
    pushReason("enemy_exposed", "They think the enemy is exposed.", -weight);
  }

  if (selfPressure > 2) {
    const weight = clamp(selfPressure * 4, 8, 28);
    score += weight;
    pushReason("capital_threatened", "Their capital is under pressure.", weight);
  }

  if (selfCapital && targetCapital) {
    const nearestTargetToSelfCapital = targetUnits.reduce((best, unit) => {
      const tile = tileMap.get(unit.tileKey);
      if (!tile) return best;
      return Math.min(best, axialDistance(tile, selfCapital));
    }, Number.POSITIVE_INFINITY);
    if (nearestTargetToSelfCapital <= 2) {
      score += 20;
      pushReason("capital_danger", "They want to avoid further losses near the capital.", 20);
    }

    const nearestSelfToTargetCapital = selfUnits.reduce((best, unit) => {
      const tile = tileMap.get(unit.tileKey);
      if (!tile) return best;
      return Math.min(best, axialDistance(tile, targetCapital));
    }, Number.POSITIVE_INFINITY);
    if (nearestSelfToTargetCapital <= 2) {
      score -= 18;
      pushReason("offensive_momentum", "They still have offensive momentum on the border.", -18);
    }
  }

  if (activeWars >= 3) {
    score += 24;
    pushReason("multiple_fronts", "They are fighting on multiple fronts.", 24);
  } else if (activeWars === 2) {
    score += 14;
    pushReason("multiple_fronts", "They are stretched across more than one front.", 14);
  }

  if (self.gold <= 15) {
    score += 14;
    pushReason("low_gold", "They need time to rebuild their economy.", 14);
  } else if (self.gold >= target.gold + 35) {
    score -= 8;
    pushReason("rich_and_ready", "They can afford to keep the war going.", -8);
  }

  if (memory) {
    const [playerA] = pairKey.split(":");
    const selfIsPlayerA = playerA === selfId;
    const previousSelfTiles = selfIsPlayerA ? memory.previousPlayerATileCount : memory.previousPlayerBTileCount;
    const previousSelfUnits = selfIsPlayerA ? memory.previousPlayerAUnitCount : memory.previousPlayerBUnitCount;
    const previousSelfVillages = selfIsPlayerA ? memory.previousPlayerAVillageCount : memory.previousPlayerBVillageCount;
    const lostTiles = Math.max(0, previousSelfTiles - selfCounts.tileCount);
    const lostUnits = Math.max(0, previousSelfUnits - selfCounts.unitCount);
    const lostVillages = Math.max(0, previousSelfVillages - selfCounts.villageCount);

    if (lostVillages > 0) {
      const weight = 18 + lostVillages * 5;
      score += weight;
      pushReason("recent_city_loss", "They recently lost cities and need breathing room.", weight);
    } else if (lostTiles > 0) {
      const weight = clamp(lostTiles * 5, 6, 18);
      score += weight;
      pushReason("recent_losses", "They have been losing ground recently.", weight);
    } else if (lostUnits >= 2) {
      const weight = clamp(lostUnits * 3, 6, 16);
      score += weight;
      pushReason("recent_losses", "They have taken heavy recent losses.", weight);
    }

    if (stallTurns >= 6 && selfOffensivePressure < 6 && targetOffensivePressure < 6) {
      const weight = clamp((stallTurns - 4) * 2, 8, 18);
      score += weight;
      pushReason("stalled_front", "The war has stalled and neither side is gaining much.", weight);
    }
  }

  if (otherEnemyPressure >= selfPressure + 2) {
    const weight = clamp(otherEnemyPressure * 3, 8, 20);
    score += weight;
    pushReason("other_front", "They need to redirect forces to another front.", weight);
  }

  if (targetPressure <= 1 && selfPressure <= 1 && selfOffensivePressure <= 3) {
    score += 8;
    pushReason("stable_border", "The border is stable enough for a ceasefire.", 8);
  }

  if (targetCounts.tileCount <= Math.max(2, selfCounts.tileCount / 2) && selfOffensivePressure >= 5) {
    score -= 14;
    pushReason("easy_conquest", "They see a chance to press an easy conquest.", -14);
  }

  if (trustPenalty > 0) {
    const weight = clamp(trustPenalty, 6, 28);
    score -= weight;
    pushReason("broken_trust", "They still remember a recently broken peace.", -weight);
  }

  if (personality === "aggressive") {
    score -= 12;
    pushReason("aggressive", "Their leadership prefers aggression.", -12);
  } else if (personality === "defensive") {
    score += 12;
    pushReason("defensive", "Their leadership prefers time to regroup.", 12);
  } else if (personality === "opportunistic") {
    const weight = powerDelta < 0 ? 8 : -8;
    score += weight;
    pushReason("opportunistic", powerDelta < 0 ? "They prefer caution when the advantage slips." : "They want to exploit their current edge.", weight);
  }

  const sorted = [...reasons].sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
  const positiveReason = sorted.find((reason) => reason.weight > 0)?.text;

  return {
    score: Math.round(score),
    reasons: sorted,
    primaryReason: positiveReason ?? "They are watching the frontier.",
    personality
  };
};

export const shouldAcceptPeaceOffer = (context: PeaceContext, randomValue = Math.random()): PeaceResolution => {
  const evaluation = evaluatePeaceWillingness(context);
  const probability = acceptanceProbabilityFromScore(evaluation.score);
  return {
    accepted: randomValue < probability,
    fromColor: context.players.find((player) => player.id === context.selfId)?.color ?? "blue",
    toPlayerId: context.targetId,
    reason: evaluation.primaryReason,
    score: evaluation.score
  };
};

export const shouldSendPeaceOffer = (context: PeaceContext, randomValue = Math.random()) => {
  const evaluation = evaluatePeaceWillingness(context);
  const probability = proposalProbabilityFromScore(evaluation.score);
  return {
    shouldSend: probability > 0 && randomValue < probability,
    probability,
    evaluation
  };
};

export const createInitialPeaceMemories = (
  players: Player[],
  tiles: Tile[],
  units: Unit[],
  villages: Village[],
  turnNumber: number
) => {
  const counts = getCountsByPlayer(players, tiles, units, villages);
  const memories: Record<string, PeacePairMemory> = {};

  for (let i = 0; i < players.length; i += 1) {
    for (let j = i + 1; j < players.length; j += 1) {
      const a = players[i];
      const b = players[j];
      const key = getDiplomacyPairKey(a.id, b.id);
      memories[key] = {
        lastOfferTurn: null,
        lastRejectedTurn: null,
        lastBrokenTurn: null,
        trustPenalty: 0,
        lastMeaningfulChangeTurn: turnNumber,
        previousPlayerATileCount: counts[a.id]?.tileCount ?? 0,
        previousPlayerBTileCount: counts[b.id]?.tileCount ?? 0,
        previousPlayerAUnitCount: counts[a.id]?.unitCount ?? 0,
        previousPlayerBUnitCount: counts[b.id]?.unitCount ?? 0,
        previousPlayerAVillageCount: counts[a.id]?.villageCount ?? 0,
        previousPlayerBVillageCount: counts[b.id]?.villageCount ?? 0
      };
    }
  }

  return memories;
};

export const updatePeaceMemories = (
  existing: Record<string, PeacePairMemory>,
  players: Player[],
  tiles: Tile[],
  units: Unit[],
  villages: Village[],
  turnNumber: number
) => {
  const counts = getCountsByPlayer(players, tiles, units, villages);
  const next: Record<string, PeacePairMemory> = { ...existing };

  for (let i = 0; i < players.length; i += 1) {
    for (let j = i + 1; j < players.length; j += 1) {
      const a = players[i];
      const b = players[j];
      const key = getDiplomacyPairKey(a.id, b.id);
      const base = next[key] ?? {
        lastOfferTurn: null,
        lastRejectedTurn: null,
        lastBrokenTurn: null,
        trustPenalty: 0,
        lastMeaningfulChangeTurn: turnNumber,
        previousPlayerATileCount: counts[a.id]?.tileCount ?? 0,
        previousPlayerBTileCount: counts[b.id]?.tileCount ?? 0,
        previousPlayerAUnitCount: counts[a.id]?.unitCount ?? 0,
        previousPlayerBUnitCount: counts[b.id]?.unitCount ?? 0,
        previousPlayerAVillageCount: counts[a.id]?.villageCount ?? 0,
        previousPlayerBVillageCount: counts[b.id]?.villageCount ?? 0
      };

      const ordered = getOrderedCounts(key, a.id, b.id, counts);
      const meaningfulChange =
        ordered.playerATileCount !== base.previousPlayerATileCount ||
        ordered.playerBTileCount !== base.previousPlayerBTileCount ||
        ordered.playerAUnitCount !== base.previousPlayerAUnitCount ||
        ordered.playerBUnitCount !== base.previousPlayerBUnitCount ||
        ordered.playerAVillageCount !== base.previousPlayerAVillageCount ||
        ordered.playerBVillageCount !== base.previousPlayerBVillageCount;

      next[key] = {
        ...base,
        trustPenalty: Math.max(0, Number((base.trustPenalty * 0.9).toFixed(2))),
        lastMeaningfulChangeTurn: meaningfulChange ? turnNumber : base.lastMeaningfulChangeTurn,
        previousPlayerATileCount: ordered.playerATileCount,
        previousPlayerBTileCount: ordered.playerBTileCount,
        previousPlayerAUnitCount: ordered.playerAUnitCount,
        previousPlayerBUnitCount: ordered.playerBUnitCount,
        previousPlayerAVillageCount: ordered.playerAVillageCount,
        previousPlayerBVillageCount: ordered.playerBVillageCount
      };
    }
  }

  return next;
};
