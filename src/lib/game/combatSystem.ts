import { UNIT_STATS } from "@/lib/game/unitSystem";
import type { Unit } from "@/lib/game/types";

export const canUnitAttackTarget = (attacker: Unit, defender: Unit) => {
  const defenderStats = UNIT_STATS[defender.type];

  // Patriot is an air-defense unit — it can ONLY attack air units
  if (attacker.type === "patriot") {
    return defenderStats.domain === "air";
  }

  const attackerStats = UNIT_STATS[attacker.type];
  // All other ground units cannot attack air units
  if (attackerStats.domain === "ground" && defenderStats.domain === "air") {
    return false;
  }

  return true;
};

export const resolveUnitCombat = (attacker: Unit, defender: Unit) => {
  const attackerStats = UNIT_STATS[attacker.type];
  const defenderHealthAfter = defender.health - attackerStats.damage;

  return {
    damage: attackerStats.damage,
    defenderHealthAfter,
    defenderDestroyed: defenderHealthAfter <= 0
  };
};
