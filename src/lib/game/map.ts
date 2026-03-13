import { GRID_RADIUS, HEX_DIRECTIONS, MIN_CAPITAL_DISTANCE } from "@/lib/game/constants";
import type { AxialCoord, Tile } from "@/lib/game/types";
import { shuffleWithSeed } from "@/lib/game/utils";

export const coordKey = (q: number, r: number) => `${q},${r}`;

export const parseCoordKey = (key: string): AxialCoord => {
  const [q, r] = key.split(",").map(Number);
  return { q, r };
};

export const generateHexGrid = (radius = GRID_RADIUS): Tile[] => {
  const tiles: Tile[] = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = -radius; r <= radius; r++) {
      if (Math.abs(q + r) <= radius) {
        tiles.push({
          q,
          r,
          key: coordKey(q, r),
          ownerId: null,
          isCapital: false,
          hasGoldMine: false,
          villageId: null,
          controlledByVillageId: null
        });
      }
    }
  }
  return tiles;
};

export const isWithinHex = (coord: AxialCoord, radius = GRID_RADIUS) =>
  Math.abs(coord.q) <= radius && Math.abs(coord.r) <= radius && Math.abs(coord.q + coord.r) <= radius;

export const getNeighborCoords = (coord: AxialCoord): AxialCoord[] =>
  HEX_DIRECTIONS.map((dir) => ({ q: coord.q + dir.q, r: coord.r + dir.r }));

export const getNeighborKeys = (coord: AxialCoord): string[] =>
  getNeighborCoords(coord).map((c) => coordKey(c.q, c.r));

export const axialDistance = (a: AxialCoord, b: AxialCoord) => {
  const x1 = a.q;
  const z1 = a.r;
  const y1 = -x1 - z1;

  const x2 = b.q;
  const z2 = b.r;
  const y2 = -x2 - z2;

  return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2), Math.abs(z1 - z2));
};

export const pickStartingCapitalKeys = (
  tiles: Tile[],
  playerCount: number,
  seed: number,
  minDistance = MIN_CAPITAL_DISTANCE
): string[] => {
  const radius = tiles.reduce((max, tile) => Math.max(max, axialDistance({ q: 0, r: 0 }, tile)), 0);
  const candidates = tiles.filter((t) => axialDistance({ q: 0, r: 0 }, t) < radius);
  const shuffled = shuffleWithSeed(candidates, seed);

  const chosen: Tile[] = [];
  for (const candidate of shuffled) {
    const farEnough = chosen.every((picked) => axialDistance(picked, candidate) >= minDistance);
    if (farEnough) chosen.push(candidate);
    if (chosen.length === playerCount) break;
  }

  if (chosen.length < playerCount) {
    for (const fallback of shuffled) {
      if (!chosen.some((x) => x.key === fallback.key)) chosen.push(fallback);
      if (chosen.length === playerCount) break;
    }
  }

  return chosen.slice(0, playerCount).map((t) => t.key);
};

export const axialToPixel = (q: number, r: number, size: number) => {
  const x = size * Math.sqrt(3) * (q + r / 2);
  const y = size * 1.5 * r;
  return { x, y };
};

export const makeHexPoints = (cx: number, cy: number, size: number) => {
  const points: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    const angle = ((60 * i - 30) * Math.PI) / 180;
    points.push(`${cx + size * Math.cos(angle)},${cy + size * Math.sin(angle)}`);
  }
  return points.join(" ");
};

export const canReachThroughDiscoveredTiles = ({
  tiles,
  sourceKey,
  targetKey,
  maxSteps,
  discovered
}: {
  tiles: Tile[];
  sourceKey: string;
  targetKey: string;
  maxSteps: number;
  discovered: Record<string, boolean>;
}) => {
  if (sourceKey === targetKey) return true;
  if (maxSteps <= 0) return false;
  if (!discovered[targetKey]) return false;

  const walkable = new Set(
    tiles.filter((tile) => discovered[tile.key]).map((tile) => tile.key)
  );
  if (!walkable.has(sourceKey) || !walkable.has(targetKey)) return false;

  const tileByKey = new Map(tiles.map((tile) => [tile.key, tile]));
  const queue: Array<{ key: string; steps: number }> = [{ key: sourceKey, steps: 0 }];
  const visited = new Set<string>([sourceKey]);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    if (current.steps >= maxSteps) continue;

    const tile = tileByKey.get(current.key);
    if (!tile) continue;

    for (const dir of HEX_DIRECTIONS) {
      const nextKey = coordKey(tile.q + dir.q, tile.r + dir.r);
      if (!walkable.has(nextKey) || visited.has(nextKey)) continue;
      if (nextKey === targetKey) return true;
      visited.add(nextKey);
      queue.push({ key: nextKey, steps: current.steps + 1 });
    }
  }

  return false;
};
