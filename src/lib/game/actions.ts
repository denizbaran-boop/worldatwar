import { INITIAL_GOLD } from "@/lib/game/constants";
import { axialDistance, coordKey } from "@/lib/game/map";
import { TECH_BY_ID } from "@/lib/game/techTree";
import { UNIT_STATS } from "@/lib/game/unitSystem";
import type { Player, RankingEntry, TechNodeId, Tile, Unit, UnitType } from "@/lib/game/types";
import { makeId } from "@/lib/game/utils";

export const setupPlayers = (colors: Player["color"][]): Player[] =>
  colors.map((color, index) => ({
    id: `player_${index + 1}`,
    color,
    gold: INITIAL_GOLD,
    isAlive: true,
    unlockedTechIds: ["military_basics"]
  }));

export const countOwnedTiles = (tiles: Tile[], playerId: string) => tiles.reduce((sum, tile) => sum + (tile.ownerId === playerId ? 1 : 0), 0);

export const rankPlayersByTiles = (tiles: Tile[], players: Player[]): RankingEntry[] =>
  players
    .map((player) => ({
      playerId: player.id,
      color: player.color,
      tileCount: countOwnedTiles(tiles, player.id)
    }))
    .sort((a, b) => b.tileCount - a.tileCount);

export const placeCapitals = (tiles: Tile[], startsByPlayer: Map<string, string>) =>
  tiles.map((tile) => {
    for (const [playerId, key] of startsByPlayer.entries()) {
      if (tile.key === key) {
        return {
          ...tile,
          ownerId: playerId,
          isCapital: true
        };
      }
    }
    return tile;
  });

export const claimCapitalStartingTerritory = (tiles: Tile[]): Tile[] => {
  const capitals = tiles.filter((t) => t.isCapital && t.ownerId);
  return tiles.map((tile) => {
    if (tile.ownerId !== null) return tile;
    const adjacent = capitals.find((cap) => axialDistance(cap, tile) <= 1);
    if (!adjacent) return tile;
    return { ...tile, ownerId: adjacent.ownerId };
  });
};

export const createStartingUnits = (tiles: Tile[], players: Player[]): Unit[] => {
  const units: Unit[] = [];
  for (const player of players) {
    const capital = tiles.find((tile) => tile.ownerId === player.id && tile.isCapital);
    if (!capital) continue;
    units.push({
      id: makeId("unit"),
      ownerId: player.id,
      tileKey: capital.key,
      type: "basic_soldier",
      health: UNIT_STATS.basic_soldier.maxHealth,
      hasMovedThisTurn: false,
      hasAttackedThisTurn: false,
      movesUsed: 0
    });
  }
  return units;
};

export const findTileByKey = (tiles: Tile[], tileKey: string) => tiles.find((tile) => tile.key === tileKey) ?? null;

export const findUnitOnTile = (units: Unit[], tileKey: string) => units.find((unit) => unit.tileKey === tileKey) ?? null;

export const isTileOccupied = (units: Unit[], tileKey: string) => Boolean(findUnitOnTile(units, tileKey));

export const unlockTechForPlayer = (players: Player[], playerId: string, techId: TechNodeId) => {
  const node = TECH_BY_ID[techId];
  if (!node) return { ok: false as const, error: "Invalid tech." };

  const player = players.find((entry) => entry.id === playerId);
  if (!player) return { ok: false as const, error: "Player not found." };
  if (player.unlockedTechIds.includes(techId)) return { ok: false as const, error: "Tech already unlocked." };
  if (!node.prerequisites.every((required) => player.unlockedTechIds.includes(required))) {
    return { ok: false as const, error: "Missing prerequisite tech." };
  }
  if (player.gold < node.cost) return { ok: false as const, error: `Need ${node.cost} gold.` };

  return {
    ok: true as const,
    players: players.map((entry) =>
      entry.id === playerId
        ? {
          ...entry,
          gold: entry.gold - node.cost,
          unlockedTechIds: [...entry.unlockedTechIds, techId]
        }
        : entry
    )
  };
};

export const canProduceUnit = (player: Player, unitType: UnitType) => {
  if (unitType === "basic_soldier") return true;

  return player.unlockedTechIds.some((techId) => {
    const node = TECH_BY_ID[techId];
    return node?.unlockedUnitType === unitType;
  });
};

export const keyFrom = (q: number, r: number) => coordKey(q, r);
