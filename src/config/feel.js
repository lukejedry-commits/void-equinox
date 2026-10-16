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

export const DODGE = {
  distance: 2.8, durationSec: 0.55,   // 2.8 m over 0.55 s (constant-speed burst through the KCC)
  iframeStartSec: 0.08, iframeEndSec: 0.38,
  recoverySec: 0.15,                  // after the burst; only cancellable into another dodge
};

export const STAMINA = {
  max: 100,
  cost: { dodge: 20, light: 12, heavy: 28 },
  fire: { base: 25, perChain: 15, chainWindowSec: 6 }, // +15 per chained cast within 6 s of the previous
  regenPerSec: 18, regenDelaySec: 0.8,
  regenFireLitPerSec: 12,             // while the fire light is lit
  exhaustionSec: 1.2,                 // at 0: no regen for 1.2 s ...
  exhaustedRegenScale: 0.5,           // ... then half-rate regen until full
};

// Intro tutorial: until the first stand is reached, speeds x0.5 and no dodge.
export const TUTORIAL = { speedScale: 0.5, dodgeEnabled: false };

export const KNOCKBACK = {
  gameplayMax: 9,                     // m/s: cap for every gameplay hit
  hardClamp: 84,                      // m/s: safety clamp (= per-step displacement cap 1.4 m / (1/60 s)); never lowered
  light: 2.5, heavy: 5, bossSlam: 8,  // m/s per hit kind
  damping: 6,                         // 1/s
  staggerMaxSec: 0.4,                 // input lock after a hit, at most
};

export const FEEL = { MOVEMENT, DODGE, STAMINA, TUTORIAL, KNOCKBACK };
