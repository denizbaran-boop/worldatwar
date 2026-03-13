import { BASE_TURN_GOLD, CAPITAL_TURN_GOLD, GOLD_MINE_TURN_GOLD, VILLAGE_TURN_GOLD } from "@/lib/game/constants";
import type { Player, Tile, Village } from "@/lib/game/types";

export const calculateTurnIncome = (playerId: string, tiles: Tile[], villages: Village[]) => {
  const capitalsOwned = tiles.filter((tile) => tile.ownerId === playerId && tile.isCapital).length;
  const villagesOwned = villages.filter((village) => village.ownerId === playerId).length;
  const minesOwned = tiles.filter((tile) => tile.ownerId === playerId && tile.hasGoldMine).length;

  const income =
    BASE_TURN_GOLD +
    capitalsOwned * CAPITAL_TURN_GOLD +
    villagesOwned * VILLAGE_TURN_GOLD +
    minesOwned * GOLD_MINE_TURN_GOLD;

  return {
    income,
    capitalsOwned,
    villagesOwned,
    minesOwned
  };
};

export const applyTurnIncome = (players: Player[], playerId: string, income: number) =>
  players.map((player) => (player.id === playerId ? { ...player, gold: player.gold + income } : player));
