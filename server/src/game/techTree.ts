import type { TechNode, TechNodeId } from "./types";

export const TECH_TREE_NODES: TechNode[] = [
  {
    id: "military_basics",
    name: "Military Basics",
    cost: 0,
    icon: "⬢",
    prerequisites: [],
    unlockedUnitType: "basic_soldier",
    gridX: 0,
    gridY: 0
  },
  {
    id: "strong_soldier",
    name: "Strong Soldier",
    cost: 90,
    icon: "⚔",
    prerequisites: ["military_basics"],
    unlockedUnitType: "strong_soldier",
    gridX: 1,
    gridY: 0
  },
  {
    id: "machine_gunner",
    name: "Machine Gunner",
    cost: 170,
    icon: "✹",
    prerequisites: ["strong_soldier"],
    unlockedUnitType: "machine_gunner",
    gridX: 2,
    gridY: 0
  },
  {
    id: "mortar",
    name: "Mortar",
    cost: 210,
    icon: "💣",
    prerequisites: ["machine_gunner"],
    unlockedUnitType: "mortar",
    gridX: 3,
    gridY: 0
  },
  {
    id: "tank",
    name: "Tank",
    cost: 280,
    icon: "🚜",
    prerequisites: ["mortar"],
    unlockedUnitType: "tank",
    gridX: 4,
    gridY: 0
  },
  {
    id: "warrior",
    name: "Warrior",
    cost: 130,
    icon: "🛡",
    prerequisites: ["military_basics"],
    unlockedUnitType: "warrior",
    gridX: -1,
    gridY: 0
  },
  {
    id: "patriot",
    name: "Patriot",
    cost: 250,
    icon: "🚀",
    prerequisites: ["warrior"],
    unlockedUnitType: "patriot",
    gridX: -2,
    gridY: 0
  },
  {
    id: "aircraft",
    name: "Fighter Jet",
    cost: 300,
    icon: "✈",
    prerequisites: ["military_basics"],
    unlockedUnitType: "aircraft",
    gridX: 0,
    gridY: -1
  },
  {
    id: "attack_helicopter",
    name: "Attack Helicopter",
    cost: 360,
    icon: "🚁",
    prerequisites: ["aircraft"],
    unlockedUnitType: "attack_helicopter",
    gridX: 0,
    gridY: -2
  }
];

export const TECH_BY_ID = Object.fromEntries(TECH_TREE_NODES.map((node) => [node.id, node])) as Record<TechNodeId, TechNode>;

export const isTechAvailable = (unlockedTechIds: TechNodeId[], techId: TechNodeId) => {
  const node = TECH_BY_ID[techId];
  if (!node) return false;
  if (unlockedTechIds.includes(techId)) return false;
  return node.prerequisites.every((id) => unlockedTechIds.includes(id));
};
