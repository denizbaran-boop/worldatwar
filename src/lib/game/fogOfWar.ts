import { axialDistance, getNeighborKeys } from "@/lib/game/map";
import type { FogOfWarState, Tile, Unit } from "@/lib/game/types";

export const createInitialFog = (playerIds: string[]): FogOfWarState =>
  Object.fromEntries(playerIds.map((id) => [id, {}]));

export const isTileDiscovered = (fog: FogOfWarState, playerId: string, tileKey: string) =>
  Boolean(fog[playerId]?.[tileKey]);

export const discoverTileAndNeighbors = (fog: FogOfWarState, playerId: string, tile: Tile): FogOfWarState => {
  const playerFog = fog[playerId] ?? {};
  const discovered = {
    ...playerFog,
    [tile.key]: true
  };

  for (const neighborKey of getNeighborKeys(tile)) {
    discovered[neighborKey] = true;
  }

  return {
    ...fog,
    [playerId]: discovered
  };
};

export const discoverTileAndNeighborsOnMap = (
  fog: FogOfWarState,
  playerId: string,
  tile: Tile,
  existingTileKeys: Set<string>
): FogOfWarState => {
  const playerFog = fog[playerId] ?? {};
  const discovered = {
    ...playerFog,
    [tile.key]: true
  };

  for (const neighborKey of getNeighborKeys(tile)) {
    if (existingTileKeys.has(neighborKey)) {
      discovered[neighborKey] = true;
    }
  }

  return {
    ...fog,
    [playerId]: discovered
  };
};

export const discoverMany = (
  fog: FogOfWarState,
  playerId: string,
  tiles: Tile[],
  existingTileKeys?: Set<string>
) => {
  let next = fog;
  for (const tile of tiles) {
    next = existingTileKeys
      ? discoverTileAndNeighborsOnMap(next, playerId, tile, existingTileKeys)
      : discoverTileAndNeighbors(next, playerId, tile);
  }
  return next;
};

export const discoverTileKeys = (fog: FogOfWarState, playerId: string, tileKeys: string[]) => {
  const playerFog = fog[playerId] ?? {};
  const nextPlayerFog = { ...playerFog };
  for (const key of tileKeys) {
    nextPlayerFog[key] = true;
  }
  return {
    ...fog,
    [playerId]: nextPlayerFog
  };
};

export const getNewlyDiscoveredKeys = (before: FogOfWarState, after: FogOfWarState, playerId: string) => {
  const previous = before[playerId] ?? {};
  const current = after[playerId] ?? {};

  return Object.keys(current).filter((key) => current[key] && !previous[key]);
};

export const revealAroundUnit = (
  fog: FogOfWarState,
  playerId: string,
  unit: Unit,
  tileMap: Map<string, Tile>,
  radius = 1
) => {
  const unitTile = tileMap.get(unit.tileKey);
  if (!unitTile) return fog;

  // Fast path for radius=1 (the common case): use O(6) neighbor key lookup
  if (radius === 1) {
    const revealKeys = [unit.tileKey, ...getNeighborKeys(unitTile).filter((k) => tileMap.has(k))];
    return discoverTileKeys(fog, playerId, revealKeys);
  }

  // Fallback for larger radii
  const revealKeys: string[] = [];
  for (const tile of tileMap.values()) {
    if (axialDistance(tile, unitTile) <= radius) revealKeys.push(tile.key);
  }
  return discoverTileKeys(fog, playerId, revealKeys);
};

export const revealAroundUnitsForPlayer = (
  fog: FogOfWarState,
  playerId: string,
  units: Unit[],
  tileMap: Map<string, Tile>,
  radius = 1
) => {
  let next = fog;
  for (const unit of units) {
    if (unit.ownerId !== playerId) continue;
    next = revealAroundUnit(next, playerId, unit, tileMap, radius);
  }
  return next;
};

export const revealAroundAllUnits = (
  fog: FogOfWarState,
  units: Unit[],
  tiles: Tile[],
  radius = 1
) => {
  // Build the map once and reuse across all players/units
  const tileMap = new Map(tiles.map((t) => [t.key, t]));
  let next = fog;
  const ownerIds = Array.from(new Set(units.map((unit) => unit.ownerId)));
  for (const ownerId of ownerIds) {
    next = revealAroundUnitsForPlayer(next, ownerId, units, tileMap, radius);
  }
  return next;
};
