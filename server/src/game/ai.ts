import { axialDistance, getNeighborKeys } from "./map";
import { canUnitAttackTarget } from "./combatSystem";
import { UNIT_STATS } from "./unitSystem";
import type { AIDifficulty, MapSize, PeaceTreaty, Player, Tile, Unit, Village } from "./types";

export type AITurnChoice = {
  unitId: string;
  targetTileKey: string;
};

export type AIStrategicMode =
  | "Expansion"
  | "Defense"
  | "Recovery"
  | "Preparation"
  | "War"
  | "Desperation";

export type AIActivityState = {
  turnsWithoutProduction: number;
  turnsWithoutExploration: number;
  turnsBoxedIn: number;
  turnsBelowTargetArmy: number;
  lastStrategicMode: AIStrategicMode | null;
};

export type AIExpansionPressure = {
  neutralExpansionOptions: number;
  unexploredFrontierScore: number;
  crowdedBorderScore: number;
  productionCongestion: number;
  boxedInScore: number;
  isBoxedIn: boolean;
};

type Snapshot = {
  playerId: string;
  players: Player[];
  tiles: Tile[];
  units: Unit[];
  villages: Village[];
  discovered: Record<string, boolean>;
  difficulty: AIDifficulty;
  mapSize: MapSize;
  peaceTreaties: PeaceTreaty[];
  strategicMode?: AIStrategicMode;
};

type UnitRole = "defender" | "reinforcer" | "frontline" | "scout" | "reserve";
type ScoredChoice = { score: number; unitId: string; targetTileKey: string };

const DIFFICULTY_BIASES: Record<AIDifficulty, {
  aggression: number;
  expansion: number;
  villagePriority: number;
  minePriority: number;
  desiredArmyBonus: number;
}> = {
  easy: { aggression: 0.7, expansion: 0.8, villagePriority: 1.0, minePriority: 0.85, desiredArmyBonus: 0 },
  normal: { aggression: 1.0, expansion: 1.0, villagePriority: 1.2, minePriority: 1.1, desiredArmyBonus: 1 },
  hard: { aggression: 1.35, expansion: 1.2, villagePriority: 1.5, minePriority: 1.35, desiredArmyBonus: 3 }
};

const MIN_CAPITAL_DEFENDERS: Record<AIDifficulty, number> = {
  easy: 1,
  normal: 2,
  hard: 3
};

const DEFENSE_RADIUS = 2;
const THREAT_RADIUS = 5;

const arePeacePartners = (treaties: PeaceTreaty[], a: string, b: string) =>
  treaties.some((treaty) =>
    (treaty.playerA === a && treaty.playerB === b) || (treaty.playerA === b && treaty.playerB === a)
  );

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const getTileMap = (tiles: Tile[]) => new Map(tiles.map((tile) => [tile.key, tile]));

const getNeighbors = (tile: Tile, tiles: Tile[]) =>
  tiles.filter((entry) => axialDistance(tile, entry) === 1);

const getVisibleHostileUnits = (snapshot: Snapshot) =>
  snapshot.units.filter((unit) =>
    unit.ownerId !== snapshot.playerId &&
    snapshot.discovered[unit.tileKey] &&
    !arePeacePartners(snapshot.peaceTreaties, snapshot.playerId, unit.ownerId)
  );

const getPeacePartners = (snapshot: Snapshot) =>
  snapshot.players
    .filter((player) => player.id !== snapshot.playerId && arePeacePartners(snapshot.peaceTreaties, snapshot.playerId, player.id))
    .map((player) => player.id);

const getVisibleEnemyBorderTiles = (snapshot: Snapshot) =>
  snapshot.tiles.filter((tile) =>
    tile.ownerId &&
    tile.ownerId !== snapshot.playerId &&
    snapshot.discovered[tile.key]
  );

const getOwnedCities = (snapshot: Snapshot) =>
  snapshot.tiles.filter((tile) => tile.ownerId === snapshot.playerId && (tile.isCapital || tile.villageId !== null));

const getPlayerIncome = (snapshot: Snapshot) => {
  const villageCount = snapshot.villages.filter((village) => village.ownerId === snapshot.playerId).length;
  const mineCount = snapshot.tiles.filter((tile) => tile.ownerId === snapshot.playerId && tile.hasGoldMine).length;
  return villageCount * 30 + mineCount * 20;
};

const unitStrength = (unit: Unit) => {
  const stats = UNIT_STATS[unit.type];
  return stats.productionCost + stats.damage * 12 + stats.maxHealth * 8 + stats.attackRange * 10;
};

export function computeCapitalThreat(
  capitalTile: Tile,
  enemyUnits: Unit[],
  tileMap: Map<string, Tile>
): number {
  let threat = 0;
  for (const enemy of enemyUnits) {
    const enemyTile = tileMap.get(enemy.tileKey);
    if (!enemyTile) continue;
    const dist = axialDistance(capitalTile, enemyTile);
    if (dist <= THREAT_RADIUS) threat += Math.max(0, THREAT_RADIUS + 1 - dist);
  }
  return threat;
}

export const evaluateExpansionPressure = (snapshot: Snapshot): AIExpansionPressure => {
  const tileMap = getTileMap(snapshot.tiles);
  const ownedTiles = snapshot.tiles.filter((tile) => tile.ownerId === snapshot.playerId);
  const occupiedTileKeys = new Set(snapshot.units.map((unit) => unit.tileKey));

  let neutralExpansionOptions = 0;
  let unexploredFrontierScore = 0;
  let crowdedBorderScore = 0;
  let productionCongestion = 0;

  for (const tile of ownedTiles) {
    if ((tile.isCapital || tile.villageId) && occupiedTileKeys.has(tile.key)) {
      productionCongestion += 1;
    }

    for (const neighborKey of getNeighborKeys(tile)) {
      const neighbor = tileMap.get(neighborKey);
      if (!neighbor) continue;
      if (!snapshot.discovered[neighborKey]) {
        unexploredFrontierScore += 1;
        continue;
      }
      if (neighbor.ownerId === null) {
        neutralExpansionOptions += 1;
      } else if (neighbor.ownerId !== snapshot.playerId) {
        crowdedBorderScore += arePeacePartners(snapshot.peaceTreaties, snapshot.playerId, neighbor.ownerId) ? 2 : 1;
      }
    }
  }

  const boxedInScore =
    crowdedBorderScore * 3 +
    productionCongestion * 4 -
    neutralExpansionOptions * 2 -
    unexploredFrontierScore;

  return {
    neutralExpansionOptions,
    unexploredFrontierScore,
    crowdedBorderScore,
    productionCongestion,
    boxedInScore,
    isBoxedIn: boxedInScore >= 8 && neutralExpansionOptions <= 3 && unexploredFrontierScore <= 4
  };
};

export const evaluateDesiredArmySize = (
  snapshot: Snapshot,
  mode: AIStrategicMode,
  activity: AIActivityState
) => {
  const cities = getOwnedCities(snapshot).length;
  const income = getPlayerIncome(snapshot);
  const hostileUnits = getVisibleHostileUnits(snapshot);
  const hostileStrength = hostileUnits.reduce((sum, unit) => sum + unitStrength(unit), 0);
  const expansionPressure = evaluateExpansionPressure(snapshot);
  const activeWars = snapshot.players.filter((player) =>
    player.isAlive &&
    player.id !== snapshot.playerId &&
    !arePeacePartners(snapshot.peaceTreaties, snapshot.playerId, player.id)
  ).length;
  const mapBase = snapshot.mapSize === "small" ? 4 : snapshot.mapSize === "medium" ? 7 : 10;
  const enemyBonus = clamp(Math.round(hostileStrength / 280), 0, 6);
  const incomeBonus = clamp(Math.floor(income / 40), 0, 6);
  const modeBonus =
    mode === "Desperation" ? 5 :
    mode === "War" ? 4 :
    mode === "Defense" ? 3 :
    mode === "Preparation" ? 3 :
    mode === "Recovery" ? 2 :
    0;

  return Math.max(
    3,
    mapBase +
      cities * 2 +
      incomeBonus +
      enemyBonus +
      activeWars * 2 +
      (expansionPressure.isBoxedIn ? 3 : 0) +
      activity.turnsBelowTargetArmy +
      DIFFICULTY_BIASES[snapshot.difficulty].desiredArmyBonus +
      modeBonus
  );
};

export const evaluateStrategicMode = (
  snapshot: Snapshot,
  activity: AIActivityState
): AIStrategicMode => {
  const tileMap = getTileMap(snapshot.tiles);
  const capitalTile = snapshot.tiles.find((tile) => tile.ownerId === snapshot.playerId && tile.isCapital);
  const hostileUnits = getVisibleHostileUnits(snapshot);
  const capitalThreat = capitalTile ? computeCapitalThreat(capitalTile, hostileUnits, tileMap) : 0;
  const expansionPressure = evaluateExpansionPressure(snapshot);
  const desiredArmySize = evaluateDesiredArmySize(snapshot, "Expansion", activity);
  const currentArmySize = snapshot.units.filter((unit) => unit.ownerId === snapshot.playerId).length;
  const player = snapshot.players.find((entry) => entry.id === snapshot.playerId);
  const gold = player?.gold ?? 0;

  if (capitalThreat >= 9 || (capitalThreat >= 6 && currentArmySize + 2 < desiredArmySize)) return "Desperation";
  if (capitalThreat >= 5) return "Defense";
  if (gold <= 25 || currentArmySize + 2 < desiredArmySize) return "Recovery";
  if (expansionPressure.isBoxedIn && activity.turnsBoxedIn >= 2) return "Preparation";
  if (hostileUnits.length > 0) return "War";
  return "Expansion";
};

export const shouldRequestReinforcements = (
  snapshot: Snapshot,
  activity: AIActivityState
) => {
  const allies = getPeacePartners(snapshot);
  if (allies.length === 0) return { shouldRequest: false, score: 0 };

  const tileMap = getTileMap(snapshot.tiles);
  const capitalTile = snapshot.tiles.find((tile) => tile.ownerId === snapshot.playerId && tile.isCapital);
  const hostileUnits = getVisibleHostileUnits(snapshot);
  const capitalThreat = capitalTile ? computeCapitalThreat(capitalTile, hostileUnits, tileMap) : 0;
  const mode = evaluateStrategicMode(snapshot, activity);
  const desiredArmySize = evaluateDesiredArmySize(snapshot, mode, activity);
  const currentArmySize = snapshot.units.filter((unit) => unit.ownerId === snapshot.playerId).length;
  const player = snapshot.players.find((entry) => entry.id === snapshot.playerId);
  const gold = player?.gold ?? 0;
  const armyDeficit = Math.max(0, desiredArmySize - currentArmySize);

  let score = 0;
  score += armyDeficit * 6;
  score += capitalThreat * 4;
  score += gold <= 25 ? 12 : 0;
  score += activity.turnsBelowTargetArmy * 5;
  score += mode === "Desperation" ? 18 : mode === "Defense" ? 10 : 0;

  return { shouldRequest: score >= 28, score };
};

export const shouldBreakPeace = (
  snapshot: Snapshot,
  targetId: string,
  activity: AIActivityState,
  trustPenalty: number
) => {
  if (!arePeacePartners(snapshot.peaceTreaties, snapshot.playerId, targetId)) {
    return { shouldBreak: false, score: Number.NEGATIVE_INFINITY };
  }

  const self = snapshot.players.find((player) => player.id === snapshot.playerId);
  const target = snapshot.players.find((player) => player.id === targetId);
  if (!self || !target) return { shouldBreak: false, score: Number.NEGATIVE_INFINITY };

  const tileMap = getTileMap(snapshot.tiles);
  const selfUnits = snapshot.units.filter((unit) => unit.ownerId === snapshot.playerId);
  const targetUnits = snapshot.units.filter((unit) => unit.ownerId === targetId);
  const selfStrength = selfUnits.reduce((sum, unit) => sum + unitStrength(unit), 0);
  const targetStrength = targetUnits.reduce((sum, unit) => sum + unitStrength(unit), 0);
  const expansionPressure = evaluateExpansionPressure(snapshot);
  const selfCapital = snapshot.tiles.find((tile) => tile.ownerId === snapshot.playerId && tile.isCapital);
  const visibleTargetBorderTiles = snapshot.tiles.filter((tile) => tile.ownerId === targetId && snapshot.discovered[tile.key]);
  const nearbyExpansionValue = visibleTargetBorderTiles.reduce((sum, tile) => {
    if (!selfCapital) return sum;
    const dist = axialDistance(selfCapital, tile);
    if (dist > 8) return sum;
    return sum + (tile.isCapital ? 20 : tile.villageId ? 12 : tile.hasGoldMine ? 8 : 4);
  }, 0);

  const borderPressure = selfUnits.reduce((sum, unit) => {
    const unitTile = tileMap.get(unit.tileKey);
    if (!unitTile) return sum;
    const nearestBorderDist = visibleTargetBorderTiles.reduce((best, tile) => Math.min(best, axialDistance(unitTile, tile)), 99);
    return sum + (nearestBorderDist <= 2 ? 4 : nearestBorderDist <= 4 ? 2 : 0);
  }, 0);

  const targetCapital = snapshot.tiles.find((tile) => tile.ownerId === targetId && tile.isCapital);
  const targetWeakBorder = targetUnits.reduce((sum, unit) => {
    const unitTile = tileMap.get(unit.tileKey);
    if (!unitTile || !targetCapital) return sum;
    return sum + (axialDistance(unitTile, targetCapital) > 3 ? 1 : 0);
  }, 0);

  const mode = evaluateStrategicMode(snapshot, activity);
  let score = 0;
  score += expansionPressure.isBoxedIn ? 24 : 0;
  score += activity.turnsBoxedIn * 5;
  score += clamp((selfStrength - targetStrength) / 120, -20, 20);
  score += borderPressure;
  score += targetWeakBorder * 2;
  score += nearbyExpansionValue * 0.6;
  score += mode === "Preparation" ? 10 : mode === "War" ? 8 : 0;
  score -= self.gold <= 25 ? 12 : 0;
  score -= trustPenalty;
  if (selfCapital && targetCapital) {
    const targetToSelfCapital = targetUnits.reduce((best, unit) => {
      const unitTile = tileMap.get(unit.tileKey);
      if (!unitTile) return best;
      return Math.min(best, axialDistance(unitTile, selfCapital));
    }, 99);
    if (targetToSelfCapital <= 3) score -= 12;
  }

  return {
    shouldBreak: score >= 42,
    score
  };
};

const computeExplorationValue = (
  tile: Tile,
  snapshot: Snapshot
) => {
  const neighbors = getNeighbors(tile, snapshot.tiles);
  const unexploredNeighbors = neighbors.filter((neighbor) => !snapshot.discovered[neighbor.key]).length;
  const neutralNeighbors = neighbors.filter((neighbor) => snapshot.discovered[neighbor.key] && neighbor.ownerId === null).length;
  return unexploredNeighbors * 20 + neutralNeighbors * 6 + (tile.hasGoldMine ? 8 : 0) + (tile.villageId ? 10 : 0);
};

const computeFrontierTiles = (snapshot: Snapshot): Tile[] => {
  const tileMap = getTileMap(snapshot.tiles);
  return snapshot.tiles.filter((candidate) =>
    snapshot.discovered[candidate.key] &&
    getNeighborKeys(candidate).some((neighborKey) => {
      const neighbor = tileMap.get(neighborKey);
      return neighbor && !snapshot.discovered[neighborKey];
    })
  );
};

const distanceToBestExplorationFront = (tile: Tile, frontierTiles: Tile[]) => {
  if (frontierTiles.length === 0) return Number.POSITIVE_INFINITY;
  return Math.min(...frontierTiles.map((entry) => axialDistance(tile, entry)));
};

function assignRoles(
  actorUnits: Unit[],
  capitalTile: Tile | undefined,
  enemyUnits: Unit[],
  tileMap: Map<string, Tile>,
  difficulty: AIDifficulty,
  snapshot: Snapshot
): Map<string, UnitRole> {
  const roles = new Map<string, UnitRole>();

  if (!capitalTile) {
    for (const unit of actorUnits) roles.set(unit.id, "frontline");
    return roles;
  }

  const threat = computeCapitalThreat(capitalTile, enemyUnits, tileMap);
  const threatBonus = difficulty === "easy" ? 0
    : difficulty === "normal" ? (threat > 3 ? 1 : 0)
    : (threat > 2 ? Math.min(2, Math.floor(threat / 2)) : 0);
  const requiredDefenders = MIN_CAPITAL_DEFENDERS[difficulty] + threatBonus;

  for (const unit of actorUnits) {
    if (unit.type !== "patriot") continue;
    const unitTile = tileMap.get(unit.tileKey);
    if (!unitTile) {
      roles.set(unit.id, "defender");
      continue;
    }
    const distToCapital = axialDistance(capitalTile, unitTile);
    roles.set(unit.id, distToCapital <= DEFENSE_RADIUS ? "defender" : "reinforcer");
  }

  const defenderCandidates = actorUnits
    .filter((unit) => !roles.has(unit.id) && unit.type !== "tank")
    .sort((a, b) => {
      const tileA = tileMap.get(a.tileKey);
      const tileB = tileMap.get(b.tileKey);
      if (!tileA || !tileB) return 0;
      return axialDistance(capitalTile, tileA) - axialDistance(capitalTile, tileB);
    });

  let defendersAssigned = [...roles.values()].filter((role) => role === "defender").length;
  for (const unit of defenderCandidates) {
    if (defendersAssigned >= requiredDefenders) break;
    const unitTile = tileMap.get(unit.tileKey);
    if (!unitTile) continue;
    const distToCapital = axialDistance(capitalTile, unitTile);
    roles.set(unit.id, distToCapital <= DEFENSE_RADIUS ? "defender" : "reinforcer");
    defendersAssigned += 1;
  }

  const scoutCandidates = actorUnits
    .filter((unit) => !roles.has(unit.id) && UNIT_STATS[unit.type].canExplore)
    .sort((a, b) => {
      const statDelta = UNIT_STATS[b.type].movementRange - UNIT_STATS[a.type].movementRange;
      if (statDelta !== 0) return statDelta;
      return UNIT_STATS[a.type].productionCost - UNIT_STATS[b.type].productionCost;
    });
  const expansionPressure = evaluateExpansionPressure(snapshot);
  const scoutSlots = threat > 5 ? 0 : clamp(Math.floor(expansionPressure.unexploredFrontierScore / 4), 1, 2);
  for (const scout of scoutCandidates.slice(0, scoutSlots)) {
    roles.set(scout.id, "scout");
  }

  for (const unit of actorUnits) {
    if (roles.has(unit.id)) continue;
    if (enemyUnits.length > 0 || expansionPressure.isBoxedIn) {
      roles.set(unit.id, "frontline");
    } else {
      roles.set(unit.id, UNIT_STATS[unit.type].canExplore ? "scout" : "reserve");
    }
  }

  return roles;
}

export const chooseAIMove = (snapshot: Snapshot): AITurnChoice | null => {
  const actorUnits = snapshot.units.filter((unit) => unit.ownerId === snapshot.playerId && !unit.hasMovedThisTurn);
  if (actorUnits.length === 0) return null;

  const tileMap = getTileMap(snapshot.tiles);
  const knownUnits = snapshot.units.filter(
    (unit) => unit.ownerId === snapshot.playerId || snapshot.discovered[unit.tileKey]
  );
  const unitByTile = new Map(knownUnits.map((unit) => [unit.tileKey, unit]));
  const villageByTile = new Map(snapshot.villages.map((village) => [village.tileKey, village]));
  const bias = DIFFICULTY_BIASES[snapshot.difficulty];
  const enemyUnits = getVisibleHostileUnits(snapshot);
  const visibleBorderTiles = getVisibleEnemyBorderTiles(snapshot);
  const capitalTile = snapshot.tiles.find((tile) => tile.ownerId === snapshot.playerId && tile.isCapital);
  const roles = assignRoles(actorUnits, capitalTile, enemyUnits, tileMap, snapshot.difficulty, snapshot);
  const mode = snapshot.strategicMode ?? "Expansion";
  const expansionPressure = evaluateExpansionPressure(snapshot);

  const frontierTiles = computeFrontierTiles(snapshot);
  let best: ScoredChoice | undefined;
  const consider = (unitId: string, targetTileKey: string, score: number) => {
    if (!best || score > best.score) best = { score, unitId, targetTileKey };
  };

  for (const unit of actorUnits) {
    const fromTile = tileMap.get(unit.tileKey);
    if (!fromTile) continue;
    const stats = UNIT_STATS[unit.type];
    const role = roles.get(unit.id) ?? "reserve";

    if (role === "defender" && capitalTile) {
      for (const enemy of enemyUnits) {
        const enemyTile = tileMap.get(enemy.tileKey);
        if (!enemyTile) continue;
        const dist = axialDistance(fromTile, enemyTile);
        if (dist === 0 || dist > stats.attackRange) continue;
        if (!canUnitAttackTarget(unit, enemy)) continue;
        if (axialDistance(capitalTile, enemyTile) > DEFENSE_RADIUS + stats.attackRange) continue;
        const score = 360 + (enemy.health <= stats.damage ? 180 : 0);
        consider(unit.id, enemy.tileKey, score);
      }
    }

    for (const tile of snapshot.tiles) {
      const dist = axialDistance(fromTile, tile);
      if (dist === 0 || dist > stats.movementRange) continue;
      if (!snapshot.discovered[tile.key]) continue;
      if (unitByTile.has(tile.key)) continue;

      let score = Math.random() * 2;
      const targetVillage = villageByTile.get(tile.key) ?? null;

      if (tile.isCapital && tile.ownerId && tile.ownerId !== snapshot.playerId && !arePeacePartners(snapshot.peaceTreaties, snapshot.playerId, tile.ownerId)) {
        score += 280 * bias.aggression;
      }
      if (targetVillage && targetVillage.ownerId !== snapshot.playerId && !arePeacePartners(snapshot.peaceTreaties, snapshot.playerId, targetVillage.ownerId ?? "")) {
        score += 110 * bias.villagePriority;
      }
      if (tile.ownerId === null) {
        score += 20 * bias.expansion;
      } else if (tile.ownerId !== snapshot.playerId && !arePeacePartners(snapshot.peaceTreaties, snapshot.playerId, tile.ownerId)) {
        score += 14 * bias.aggression;
      }
      if (tile.hasGoldMine && tile.ownerId !== snapshot.playerId) score += 40 * bias.minePriority;

      const explorationValue = computeExplorationValue(tile, snapshot);
      const explorationDist = distanceToBestExplorationFront(tile, frontierTiles);

      if (role === "reinforcer" && capitalTile) {
        const currentDist = axialDistance(fromTile, capitalTile);
        const newDist = axialDistance(tile, capitalTile);
        score += 460 + (currentDist - newDist) * 80;
      } else if (role === "defender" && capitalTile) {
        const distToCapital = axialDistance(tile, capitalTile);
        if (distToCapital <= DEFENSE_RADIUS) {
          score += 70 - distToCapital * 10;
        } else {
          score -= 40;
        }
      } else if (role === "scout") {
        score += explorationValue * 1.6;
        if (explorationDist < Infinity) score += Math.max(0, 12 - explorationDist * 3);
        if (tile.ownerId === null) score += 15;
      } else if (role === "frontline") {
        for (const enemy of enemyUnits) {
          const enemyTile = tileMap.get(enemy.tileKey);
          if (!enemyTile) continue;
          const attackDist = axialDistance(tile, enemyTile);
          if (attackDist > 0 && attackDist <= stats.attackRange && canUnitAttackTarget(unit, enemy)) {
            score += enemy.health <= stats.damage ? 140 : 75;
            if (enemyTile.isCapital) score += 50;
          }
        }
        if (visibleBorderTiles.length > 0) {
          const nearestBorder = Math.min(...visibleBorderTiles.map((entry) => axialDistance(tile, entry)));
          score += Math.max(0, 12 - nearestBorder * 2) * bias.aggression;
        }
      } else {
        score += explorationValue * 0.7;
      }

      if (mode === "Preparation" || expansionPressure.isBoxedIn) {
        if (visibleBorderTiles.length > 0) {
          const nearestBorder = Math.min(...visibleBorderTiles.map((entry) => axialDistance(tile, entry)));
          score += Math.max(0, 10 - nearestBorder) * 4;
        }
      }

      if (mode === "Expansion" || mode === "Recovery") {
        score += explorationValue;
      }

      if (mode === "Defense" || mode === "Desperation") {
        if (capitalTile) score -= axialDistance(tile, capitalTile) * 4;
      }

      consider(unit.id, tile.key, score);
    }

    if (role !== "scout") {
      for (const enemy of enemyUnits) {
        const enemyTile = tileMap.get(enemy.tileKey);
        if (!enemyTile) continue;
        const dist = axialDistance(fromTile, enemyTile);
        if (dist === 0 || dist > stats.attackRange) continue;
        if (!canUnitAttackTarget(unit, enemy)) continue;

        let score = 390 * bias.aggression;
        if (enemy.health <= stats.damage) score += 240;
        if (enemyTile.isCapital) score += 90;
        if (enemyTile.villageId) score += 35;
        if (mode === "Desperation" && capitalTile) {
          score += Math.max(0, 8 - axialDistance(enemyTile, capitalTile)) * 16;
        }
        consider(unit.id, enemy.tileKey, score);
      }
    }
  }

  if (best === undefined) return null;
  return { unitId: best.unitId, targetTileKey: best.targetTileKey };
};
