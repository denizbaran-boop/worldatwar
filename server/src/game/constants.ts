import type { MapSize, PlayerColor } from "./types";

export const PLAYER_COLORS: PlayerColor[] = ["blue", "red", "purple", "green", "yellow"];

export const COLOR_HEX: Record<PlayerColor, string> = {
  blue: "#3b82f6",
  red: "#ef4444",
  purple: "#a855f7",
  green: "#22c55e",
  yellow: "#eab308"
};

export const INITIAL_GOLD = 10;
export const BASE_TURN_GOLD = 0;
export const CAPITAL_TURN_GOLD = 10;
export const VILLAGE_TURN_GOLD = 30;
export const GOLD_MINE_TURN_GOLD = 20;

export const VILLAGE_COUNT = 8;
export const GOLD_MINE_COUNT = 14;

export const GRID_RADIUS = 7;
export const MIN_CAPITAL_DISTANCE = 5;

export const MAP_SIZE_PRESETS: Record<MapSize, {
  radius: number;
  villages: number;
  mines: number;
  minCapitalDistance: number;
}> = {
  small: {
    radius: 6,
    villages: 7,
    mines: 11,
    minCapitalDistance: 4
  },
  medium: {
    radius: 9,
    villages: 13,
    mines: 21,
    minCapitalDistance: 6
  },
  large: {
    radius: 13,
    villages: 22,
    mines: 38,
    minCapitalDistance: 9
  }
};

export const HEX_DIRECTIONS = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 }
];
