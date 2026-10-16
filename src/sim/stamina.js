// Stamina: deterministic SIM-SIDE system, advanced once per fixed step (integer step
// counters for every timer; no wall clock, no randomness). Numbers: config/feel.js.
import { STAMINA, MOVEMENT, SIM_HZ, steps } from '../config/feel.js';

export function createStamina(cfg = STAMINA, hz = SIM_HZ) {
  const s = {
    value: cfg.max, tick: 0,
    delayLeft: 0, exhaustLeft: 0, halfRate: false,
    fireChain: -1, lastFireTick: -Infinity,
  };
  const DELAY = steps(cfg.regenDelaySec), EXHAUST = steps(cfg.exhaustionSec), CHAIN = steps(cfg.fire.chainWindowSec);
  const usable = () => s.value > 0 && s.exhaustLeft === 0;
  function drain(amount) {
    s.value = Math.max(0, s.value - amount); s.delayLeft = DELAY;
    if (s.value === 0) { s.exhaustLeft = EXHAUST; s.halfRate = true; s.delayLeft = 0; } // exhaustion replaces the delay
  }
  // Action costs: allowed while stamina > 0 (an action may take it to 0); refused while
  // exhausted or empty. Returns true if the action happens.
  function spend(cost) { if (!usable()) return false; drain(cost); return true; }
  function fireCost() { return cfg.fire.base + cfg.fire.perChain * (s.tick - s.lastFireTick <= CHAIN ? s.fireChain + 1 : 0); }
  function castFire() {
    if (!usable()) return false;
    const chained = s.tick - s.lastFireTick <= CHAIN;
    drain(fireCost()); s.fireChain = chained ? s.fireChain + 1 : 0; s.lastFireTick = s.tick;
    return true;
  }
  // One fixed step. sprinting: sprint was requested this step (drains if usable).
  // Returns whether sprint is allowed this step.
  function step({ fireLit = false, sprinting = false } = {}) {
    s.tick++;
    let sprintOk = false;
    if (sprinting && usable()) { drain(MOVEMENT.sprintStaminaPerSec / hz); sprintOk = true; }
    else if (s.exhaustLeft > 0) s.exhaustLeft--;
    else if (s.delayLeft > 0) s.delayLeft--;
    else if (s.value < cfg.max) {
      const rate = (fireLit ? cfg.regenFireLitPerSec : cfg.regenPerSec) * (s.halfRate ? cfg.exhaustedRegenScale : 1);
      s.value = Math.min(cfg.max, s.value + rate / hz);
      if (s.value === cfg.max) s.halfRate = false;
    }
    return sprintOk;
  }
  return {
    state: s, spend, castFire, fireCost, step, usable,
    dodge: () => spend(cfg.cost.dodge), light: () => spend(cfg.cost.light), heavy: () => spend(cfg.cost.heavy),
    get value() { return s.value; }, get exhausted() { return s.exhaustLeft > 0; },
  };
}
