import { findTileByKey, findUnitOnTile } from "@/lib/game/actions";
import { canUnitAttackTarget, resolveUnitCombat } from "@/lib/game/combatSystem";
import { HEX_DIRECTIONS } from "@/lib/game/constants";
import { axialDistance, coordKey } from "@/lib/game/map";
import { UNIT_STATS } from "@/lib/game/unitSystem";
import type { PeaceTreaty, Tile, Unit } from "@/lib/game/types";

export type UnitActionPreview =
  | {
    kind: "move";
    unit: Unit;
    sourceTile: Tile;
    targetTile: Tile;
    path: Tile[];
  }
  | {
    kind: "attack";
    unit: Unit;
    sourceTile: Tile;
    targetTile: Tile;
    targetUnit: Unit;
    isRanged: boolean;
    combat: ReturnType<typeof resolveUnitCombat>;
  };

const arePeacePartners = (peaceTreaties: PeaceTreaty[], a: string, b: string) =>
  peaceTreaties.some(
    (treaty) =>
      (treaty.playerA === a && treaty.playerB === b) ||
      (treaty.playerA === b && treaty.playerB === a)
  );

const findPath = (tiles: Tile[], sourceKey: string, targetKey: string, maxSteps: number) => {
  if (sourceKey === targetKey) return [findTileByKey(tiles, sourceKey)].filter(Boolean) as Tile[];

  const tileByKey = new Map(tiles.map((tile) => [tile.key, tile]));
  const queue: Array<{ key: string; path: string[] }> = [{ key: sourceKey, path: [sourceKey] }];
  const visited = new Set<string>([sourceKey]);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;

    if (current.path.length - 1 >= maxSteps) continue;

    const tile = tileByKey.get(current.key);
    if (!tile) continue;

    for (const dir of HEX_DIRECTIONS) {
      const nextKey = coordKey(tile.q + dir.q, tile.r + dir.r);
      if (visited.has(nextKey) || !tileByKey.has(nextKey)) continue;
      const nextPath = [...current.path, nextKey];
      if (nextKey === targetKey) {
        return nextPath.map((key) => tileByKey.get(key)).filter(Boolean) as Tile[];
      }
      visited.add(nextKey);
      queue.push({ key: nextKey, path: nextPath });
    }
  }

  return null;
};

export const previewUnitAction = ({
  units,
  tiles,
  peaceTreaties,
  currentPlayerId,
  justBrokePeace,
  unitId,
  targetTileKey
}: {
  units: Unit[];
  tiles: Tile[];
  peaceTreaties: PeaceTreaty[];
  currentPlayerId: string | null;
  justBrokePeace: string[];
  unitId: string;
  targetTileKey: string;
}): { ok: true; preview: UnitActionPreview } | { ok: false; error: string } => {
  if (!currentPlayerId) return { ok: false, error: "No active turn." };

  const unit = units.find((entry) => entry.id === unitId);
  if (!unit || unit.ownerId !== currentPlayerId) return { ok: false, error: "Invalid unit." };
  if (unit.hasMovedThisTurn) return { ok: false, error: "This unit has no actions left this turn." };
  if (justBrokePeace.length > 0) return { ok: false, error: "Cannot act after breaking a peace treaty. End your turn." };

  const sourceTile = findTileByKey(tiles, unit.tileKey);
  const targetTile = findTileByKey(tiles, targetTileKey);
  if (!sourceTile || !targetTile) return { ok: false, error: "Invalid tile." };

  const stats = UNIT_STATS[unit.type];
  const isAirUnit = stats.domain === "air";
  const movesUsed = unit.movesUsed ?? 0;
  // Air units: moved but not attacked → must attack next, no movement available
  // Air units: post-attack → remaining budget
  // Air units: fresh → full range
  const effectiveMovementRange = isAirUnit
    ? (movesUsed > 0 && !unit.hasAttackedThisTurn ? 0
      : unit.hasAttackedThisTurn ? stats.movementRange - movesUsed
      : stats.movementRange)
    : stats.movementRange;

  const distance = axialDistance(sourceTile, targetTile);
  const occupant = findUnitOnTile(units, targetTile.key);

  if (occupant && occupant.ownerId === unit.ownerId) {
    return { ok: false, error: "Target tile is occupied by your own unit." };
  }

  const isEnemyOccupied = Boolean(occupant && occupant.ownerId !== unit.ownerId);
  const isRangedAttack = isEnemyOccupied && distance > effectiveMovementRange && distance <= stats.attackRange;

  if (!isRangedAttack && distance > effectiveMovementRange) {
    return { ok: false, error: `Out of range. Max range is ${effectiveMovementRange}.` };
  }

  if (isEnemyOccupied && distance > stats.attackRange) {
    return { ok: false, error: `Out of attack range. Attack range is ${stats.attackRange}.` };
  }

  if (!isEnemyOccupied && isAirUnit && (targetTile.isCapital || targetTile.villageId !== null)) {
    return { ok: false, error: "Air units cannot land on cities or capitals." };
  }

  if (occupant) {
    if (arePeacePartners(peaceTreaties, unit.ownerId, occupant.ownerId)) {
      return { ok: false, error: "Cannot attack a peace partner." };
    }
    if (justBrokePeace.includes(occupant.ownerId)) {
      return { ok: false, error: "Cannot attack this turn after breaking peace." };
    }
    if (unit.hasAttackedThisTurn) {
      return { ok: false, error: "This unit has already attacked this turn." };
    }
    if (!canUnitAttackTarget(unit, occupant)) {
      return { ok: false, error: "Ground units cannot attack aircraft." };
    }

    return {
      ok: true,
      preview: {
        kind: "attack",
        unit,
        sourceTile,
        targetTile,
        targetUnit: occupant,
        isRanged: isRangedAttack,
        combat: resolveUnitCombat(unit, occupant)
      }
    };
  }

  const path = findPath(tiles, sourceTile.key, targetTile.key, effectiveMovementRange);
  if (!path) {
    return { ok: false, error: "No valid movement path found." };
  }

  return {
    ok: true,
    preview: {
      kind: "move",
      unit,
      sourceTile,
      targetTile,
      path
    }
  };
};
