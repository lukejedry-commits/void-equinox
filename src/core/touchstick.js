// Touch move-stick shaping. Pure and deterministic: the raw axes are quantized to 16-bit
// integers FIRST, and everything after is a function of those integers only, so a
// recorded input frame (which stores qx/qz and the shaped result) replays bit-identically.
import { TOUCH, GAIT } from '../config/feel.js';

const Q = (1 << (TOUCH.stick.quantBits - 1)) - 1; // 32767
export const STICK_Q = Q;
export function quantizeAxis(v) { return Math.round(Math.max(-1, Math.min(1, v)) * Q); }

// qx, qz: int16 axes (x right, z down-screen = backwards). Returns { mx, mz, gait, mag }.
export function shapeStick(qx, qz, cfg = TOUCH.stick) {
  const x = qx / Q, z = qz / Q, m = Math.hypot(x, z);
  if (m < cfg.deadZone) return { mx: 0, mz: 0, gait: GAIT.walk, mag: m };
  const t = Math.min(1, (m - cfg.deadZone) / (cfg.outerSat - cfg.deadZone)); // radial dead zone + outer saturation
  const out = Math.pow(t, cfg.curveExp);
  return { mx: (x / m) * out, mz: (z / m) * out, gait: m > cfg.runAbove ? GAIT.run : GAIT.walk, mag: m };
}
