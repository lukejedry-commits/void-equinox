// Feel numbers from the Mechanics Designer: the single source of truth for movement,
// dodge, stamina, knockback, camera, touch and attack-windup tuning. SIM-SIDE values
// (movement, dodge, stamina, knockback, tutorial) feed the deterministic fixed-step sim;
// camera / touch values are render/input-side only.
export const SIM_HZ = 60;
export const steps = (sec) => Math.round(sec * SIM_HZ); // seconds -> fixed steps

export const MOVEMENT = {
  walk: 1.8, run: 4.2, sprint: 5.8,   // m/s
  sprintStaminaPerSec: 12,
  accelSec: 0.15,                     // 0 -> full speed
  decelSec: 0.1,                      // full speed -> 0
};
// Gait codes carried in the recorded input frame (`gait`).
export const GAIT = { walk: 0, run: 1, sprint: 2 };

export const FEEL = { MOVEMENT };
