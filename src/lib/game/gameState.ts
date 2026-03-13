import { MAP_SIZE_PRESETS } from "@/lib/game/constants";
import { createInitialFog, discoverMany, discoverTileAndNeighborsOnMap } from "@/lib/game/fogOfWar";
import { generateHexGrid, pickStartingCapitalKeys } from "@/lib/game/map";
import {
  applyVillageMarkersToTiles,
  generateGoldMines,
  generateVillages
} from "@/lib/game/villageSystem";
import { claimCapitalStartingTerritory, createStartingUnits, placeCapitals, setupPlayers } from "@/lib/game/actions";
import type { MatchConfig } from "@/lib/game/types";

export const createInitialGameState = (config: MatchConfig) => {
  const seed = config.seed ?? Date.now();
  const colors = config.colors.slice(0, config.playerCount);
  const players = setupPlayers(colors);
  const mapPreset = MAP_SIZE_PRESETS[config.mapSize];

  const baseTiles = generateHexGrid(mapPreset.radius);
  const capitalKeys = pickStartingCapitalKeys(baseTiles, players.length, seed, mapPreset.minCapitalDistance);
  const startsByPlayer = new Map(players.map((player, index) => [player.id, capitalKeys[index]]));
  const capitalTiles = claimCapitalStartingTerritory(placeCapitals(baseTiles, startsByPlayer));

  const villages = generateVillages(capitalTiles, seed, mapPreset.villages);
  const mineTileKeys = generateGoldMines(capitalTiles, villages, seed, mapPreset.mines);
  const tiles = applyVillageMarkersToTiles(capitalTiles, villages, mineTileKeys);
  const tileKeys = new Set(tiles.map((tile) => tile.key));

  const units = createStartingUnits(tiles, players);

  let fogOfWar = createInitialFog(players.map((player) => player.id));
  for (const player of players) {
    const playerCapitalTiles = tiles.filter((tile) => tile.ownerId === player.id && tile.isCapital);
    fogOfWar = discoverMany(fogOfWar, player.id, playerCapitalTiles, tileKeys);
  }

  for (const unit of units) {
    const tile = tiles.find((entry) => entry.key === unit.tileKey);
    if (tile) fogOfWar = discoverTileAndNeighborsOnMap(fogOfWar, unit.ownerId, tile, tileKeys);
  }

  return {
    players,
    tiles,
    villages,
    units,
    fogOfWar,
    seed
  };
};
