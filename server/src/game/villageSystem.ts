import { GOLD_MINE_COUNT, VILLAGE_COUNT } from "./constants";
import { axialDistance } from "./map";
import type { Tile, Village } from "./types";
import { makeId, shuffleWithSeed } from "./utils";

export const getTilesWithinDistance = (tiles: Tile[], centerTile: Tile, distance: number) =>
  tiles.filter((tile) => axialDistance(centerTile, tile) <= distance);

export const generateVillages = (tiles: Tile[], seed: number, count = VILLAGE_COUNT): Village[] => {
  const center = { q: 0, r: 0 };
  const radius = tiles.reduce((max, tile) => Math.max(max, axialDistance(center, tile)), 0);
  const minDist = Math.max(2, Math.floor(radius * 0.2));
  const maxDist = Math.floor(radius * 0.82);

  const zoneCandidates = tiles.filter((tile) => {
    if (tile.isCapital || tile.ownerId !== null) return false;
    const d = axialDistance(center, tile);
    return d >= minDist && d <= maxDist;
  });

  const sectors: Tile[][] = Array.from({ length: count }, () => []);
  for (const tile of zoneCandidates) {
    const x = Math.sqrt(3) * (tile.q + tile.r / 2);
    const y = 1.5 * tile.r;
    const angle = Math.atan2(y, x) + Math.PI;
    const idx = Math.floor((angle / (2 * Math.PI)) * count) % count;
    sectors[idx].push(tile);
  }

  const selected: Tile[] = [];
  for (let i = 0; i < count; i++) {
    const shuffled = shuffleWithSeed(sectors[i], seed + 91 + i * 37);
    for (const candidate of shuffled) {
      if (selected.some((s) => axialDistance(s, candidate) <= 2)) continue;
      selected.push(candidate);
      break;
    }
  }

  if (selected.length < count) {
    const fallback = shuffleWithSeed(zoneCandidates, seed + 91);
    for (const tile of fallback) {
      if (selected.some((s) => axialDistance(s, tile) <= 2)) continue;
      selected.push(tile);
      if (selected.length >= count) break;
    }
  }

  return selected.map((tile) => ({
    id: makeId("village"),
    tileKey: tile.key,
    ownerId: null,
    controlledTileKeys: []
  }));
};

export const generateGoldMines = (tiles: Tile[], villages: Village[], seed: number, count = GOLD_MINE_COUNT) => {
  const villageTileSet = new Set(villages.map((village) => village.tileKey));
  const candidates = tiles.filter((tile) => !tile.isCapital && !villageTileSet.has(tile.key));
  const shuffled = shuffleWithSeed(candidates, seed + 173);
  return new Set(shuffled.slice(0, Math.min(count, shuffled.length)).map((tile) => tile.key));
};

export const applyVillageMarkersToTiles = (tiles: Tile[], villages: Village[], mineTileKeys: Set<string>) => {
  const byTileKey = new Map(villages.map((village) => [village.tileKey, village]));

  return tiles.map((tile) => ({
    ...tile,
    villageId: byTileKey.get(tile.key)?.id ?? null,
    hasGoldMine: mineTileKeys.has(tile.key)
  }));
};

export const claimVillageTerritory = (tiles: Tile[], villages: Village[], villageId: string, ownerId: string) => {
  const village = villages.find((entry) => entry.id === villageId);
  if (!village) {
    return { tiles, villages, changed: false };
  }

  const centerTile = tiles.find((tile) => tile.key === village.tileKey);
  if (!centerTile) {
    return { tiles, villages, changed: false };
  }

  const controlledTiles = getTilesWithinDistance(tiles, centerTile, 1);
  const controlledTileKeys = controlledTiles.map((tile) => tile.key);

  const nextTiles = tiles.map((tile) => {
    if (!controlledTileKeys.includes(tile.key)) return tile;
    return {
      ...tile,
      ownerId,
      controlledByVillageId: villageId
    };
  });

  const nextVillages = villages.map((entry) =>
    entry.id === villageId
      ? {
        ...entry,
        ownerId,
        controlledTileKeys
      }
      : entry
  );

  return {
    tiles: nextTiles,
    villages: nextVillages,
    changed: village.ownerId !== ownerId
  };
};

export const revealKeysForVillage = (tiles: Tile[], villages: Village[], villageId: string) => {
  const village = villages.find((entry) => entry.id === villageId);
  if (!village) return [];

  const centerTile = tiles.find((tile) => tile.key === village.tileKey);
  if (!centerTile) return [];

  return getTilesWithinDistance(tiles, centerTile, 2).map((tile) => tile.key);
};
