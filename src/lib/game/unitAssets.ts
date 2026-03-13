import type { PlayerColor, UnitType } from "@/lib/game/types";

export const BASIC_SOLDIER_IMAGE: Record<PlayerColor, string> = {
  blue: "/units/blue_soldier.png",
  red: "/units/red_soldier.png",
  green: "/units/green_soldier.png",
  purple: "/units/purple_soldier.png",
  yellow: "/units/yellow_soldier.png"
};

export const WARRIOR_IMAGE: Record<PlayerColor, string> = {
  blue: "/units/blue_warrior.png",
  red: "/units/red_warrior.png",
  green: "/units/green_warrior.png",
  purple: "/units/purple_warrior.png",
  yellow: "/units/yellow_warrior.png"
};

export const TANK_IMAGE: Record<PlayerColor, string> = {
  green: "/units/green_tank.png",
  blue: "/units/blue_tank.png",
  red: "/units/red_tank.png",
  purple: "/units/purple_tank.png",
  yellow: "/units/yellow_tank.png"
};

export const STRONG_SOLDIER_IMAGE: Record<PlayerColor, string> = {
  green: "/units/green_strong_soldier.png",
  blue: "/units/blue_strong_soldier.png",
  red: "/units/red_strong_soldier.png",
  purple: "/units/purple_strong_soldier.png",
  yellow: "/units/yellow_strong_soldier.png"
};

export const ATTACK_CHOPTER_IMAGE: Record<PlayerColor, string> = {
  blue: "/units/blue_attack_chopter.png",
  red: "/units/red_attack_chopter.png",
  green: "/units/green_attack_chopter.png",
  yellow: "/units/yellow_attack_chopter.png",
  purple: "/units/purple_attack_chopter.png"
};

export const UNIT_IMAGE: Record<UnitType, string> = {
  basic_soldier: "/units/soldier.png",
  strong_soldier: "/units/green_strong_soldier.png",
  warrior: "/units/warrior.png",
  machine_gunner: "/units/machine_gunner.png",
  mortar: "/units/mortar.png",
  tank: "/units/green_tank.png",
  aircraft: "/units/fighter_jet.png",
  patriot: "/units/patriot.png",
  attack_helicopter: "/units/attack_helicopter.png"
};
