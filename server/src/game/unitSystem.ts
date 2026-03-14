import type { UnitDomain, UnitType } from "./types";

export type UnitStats = {
  type: UnitType;
  name: string;
  icon: string;
  damage: number;
  maxHealth: number;
  movementRange: number;
  attackRange: number;
  domain: UnitDomain;
  canExplore: boolean;
  productionCost: number;
};

export const UNIT_STATS: Record<UnitType, UnitStats> = {
  basic_soldier: {
    type: "basic_soldier",
    name: "Basic Soldier",
    icon: "🪖",
    damage: 1,
    maxHealth: 2,
    movementRange: 1,
    attackRange: 1,
    domain: "ground",
    canExplore: true,
    productionCost: 40
  },
  strong_soldier: {
    type: "strong_soldier",
    name: "Strong Soldier",
    icon: "⚔",
    damage: 2,
    maxHealth: 3,
    movementRange: 2,
    attackRange: 1,
    domain: "ground",
    canExplore: true,
    productionCost: 70
  },
  warrior: {
    type: "warrior",
    name: "Warrior",
    icon: "🛡",
    damage: 2,
    maxHealth: 4,
    movementRange: 1,
    attackRange: 1,
    domain: "ground",
    canExplore: true,
    productionCost: 95
  },
  machine_gunner: {
    type: "machine_gunner",
    name: "Machine Gunner",
    icon: "✹",
    damage: 3,
    maxHealth: 2,
    movementRange: 1,
    attackRange: 2,
    domain: "ground",
    canExplore: true,
    productionCost: 120
  },
  mortar: {
    type: "mortar",
    name: "Mortar",
    icon: "💣",
    damage: 4,
    maxHealth: 3,
    movementRange: 1,
    attackRange: 3,
    domain: "ground",
    canExplore: true,
    productionCost: 145
  },
  tank: {
    type: "tank",
    name: "Tank",
    icon: "🚜",
    damage: 5,
    maxHealth: 10,
    movementRange: 1,
    attackRange: 3,
    domain: "ground",
    canExplore: true,
    productionCost: 195
  },
  aircraft: {
    type: "aircraft",
    name: "Aircraft",
    icon: "✈",
    damage: 4,
    maxHealth: 3,
    movementRange: 4,
    attackRange: 1,
    domain: "air",
    canExplore: true,
    productionCost: 270
  },
  patriot: {
    type: "patriot",
    name: "Patriot",
    icon: "🚀",
    damage: 3,
    maxHealth: 5,
    movementRange: 1,
    attackRange: 4,
    domain: "ground",
    canExplore: false,
    productionCost: 190
  },
  attack_helicopter: {
    type: "attack_helicopter",
    name: "Attack Helicopter",
    icon: "🚁",
    damage: 3,
    maxHealth: 5,
    movementRange: 2,
    attackRange: 2,
    domain: "air",
    canExplore: true,
    productionCost: 240
  }
};

export const UNIT_PROGRESSION: UnitType[] = [
  "basic_soldier",
  "strong_soldier",
  "warrior",
  "machine_gunner",
  "mortar",
  "tank",
  "aircraft",
  "patriot",
  "attack_helicopter"
];
