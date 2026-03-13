export const MOVE_STEP_DURATION_MS = 180;
export const MOVE_STEP_SETTLE_MS = 24;
export const ATTACK_WINDUP_MS = 90;
export const TARGET_HIT_FLASH_MS = 220;
export const DEATH_FADE_MS = 260;

export const MOVE_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
export const ATTACK_EASING = "cubic-bezier(0.2, 0.9, 0.2, 1)";

export const ATTACK_RECOIL_BY_TYPE = {
  basic_soldier: 3,
  strong_soldier: 4,
  warrior: 5,
  machine_gunner: 4,
  mortar: 6,
  tank: 7,
  aircraft: 4,
  patriot: 5,
  attack_helicopter: 4
} as const;

export const HIT_SHAKE_DISTANCE = 4;
