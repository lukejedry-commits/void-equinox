// Input sampled once per physics step, applied in fixed order; recordable & replayable.
// A frame of input: { mx, mz, dodge, yawQ, gait } (move axes in -1..1, dodge edge-triggered
// bool, yawQ = camera yaw quantized to YAW_Q_STEPS per turn; movement is rotated by it).
// yawQ is recorded with every step, so replays use the recorded yaw, never the live camera.
export const YAW_Q_STEPS = 65536;
export function quantizeYaw(yaw) {
  const q = Math.round((yaw / (2 * Math.PI)) * YAW_Q_STEPS) % YAW_Q_STEPS;
  return q < 0 ? q + YAW_Q_STEPS : q;
}
export function yawFromQ(q) { return (q * 2 * Math.PI) / YAW_Q_STEPS; }
import { GAIT } from '../config/feel.js';
import { shapeStick } from './touchstick.js';
export function emptyInput() { return { mx: 0, mz: 0, dodge: false, yawQ: 0, gait: GAIT.run, light: false, heavy: false, fire: false }; }

// getYaw: optional render-side provider of the live camera yaw (radians).
export function createInput({ getYaw = null } = {}) {
  const held = new Set();
  let dodgeLatched = false;
  const latched = { light: false, heavy: false, fire: false }; // attack stub edges (J / K / F)
  let heavyCharged = false;
  // Touch: int16 stick axes (already quantized by the touch UI) + held-dodge sprint.
  const touch = { active: false, qx: 0, qz: 0, sprint: false };
  let source = null; // replay log if set
  let recording = null;

  function sampleLive() {
    const mx = (held.has('KeyD') ? 1 : 0) - (held.has('KeyA') ? 1 : 0);
    const mz = (held.has('KeyS') ? 1 : 0) - (held.has('KeyW') ? 1 : 0);
    // Gait: run by default, Shift sprints, Alt walks.
    const gait = held.has('ShiftLeft') || held.has('ShiftRight') ? GAIT.sprint : held.has('AltLeft') || held.has('AltRight') ? GAIT.walk : GAIT.run;
    const f = { mx, mz, dodge: dodgeLatched, yawQ: getYaw ? quantizeYaw(getYaw()) : 0, gait,
      light: latched.light, heavy: latched.heavy, fire: latched.fire, heavyCharged: latched.heavy && heavyCharged };
    if (touch.active) { // touch stick overrides keys; frame keeps the int16 source axes
      const t = shapeStick(touch.qx, touch.qz);
      f.mx = t.mx; f.mz = t.mz; f.gait = touch.sprint ? GAIT.sprint : t.gait; f.qx = touch.qx; f.qz = touch.qz;
    } else if (touch.sprint) f.gait = GAIT.sprint;
    latched.light = latched.heavy = latched.fire = false; heavyCharged = false;
    dodgeLatched = false; // edge consumed by exactly one step
    return f;
  }

  return {
    attach(target = window) {
      target.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && !e.repeat) dodgeLatched = true;
        if (!e.repeat) { if (e.code === 'KeyJ') latched.light = true; if (e.code === 'KeyK') latched.heavy = true; if (e.code === 'KeyF') latched.fire = true; }
        held.add(e.code);
      });
      target.addEventListener('keyup', (e) => held.delete(e.code));
      target.addEventListener('blur', () => held.clear());
    },
    // Programmatic (tests / AI): set held state & press dodge.
    setHeld(code, down) { down ? held.add(code) : held.delete(code); },
    pressDodge() { dodgeLatched = true; },
    press(action, opts = {}) { latched[action] = true; if (action === 'heavy') heavyCharged = !!opts.charged; }, // 'light' | 'heavy' | 'fire'
    // Touch stick: int16 axes from quantizeAxis(); active=false releases it.
    setTouchStick(qx, qz, active = true) { touch.qx = qx | 0; touch.qz = qz | 0; touch.active = active; },
    setTouchSprint(on) { touch.sprint = on; },
    // Called exactly once per physics step, before world.step.
    sample(tick) {
      const f = source ? (source[tick] ?? emptyInput()) : sampleLive();
      if (recording) recording[tick] = { ...f };
      return f;
    },
    startRecording() { recording = []; },
    stopRecording() { const r = recording; recording = null; return r; },
    replay(log) { source = log; },
    setYawProvider(fn) { getYaw = fn; },
    stopReplay() { source = null; },
  };
}

// Seeded random input log generator (tests).
export function randomInputLog(rng, steps) {
  const log = [];
  let mx = 0, mz = 0;
  for (let i = 0; i < steps; i++) {
    if (rng.next() < 0.03) { mx = rng.int(-1, 1); mz = rng.int(-1, 1); }
    log.push({ mx, mz, dodge: rng.next() < 0.01 });
  }
  return log;
}
