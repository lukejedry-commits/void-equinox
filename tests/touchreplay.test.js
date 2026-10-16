import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initRapier, snapshot } from './helpers.js';
import { buildScene, stepScene } from '../src/game/scene.js';
import { createInput } from '../src/core/input.js';
import { quantizeAxis, shapeStick, STICK_Q } from '../src/core/touchstick.js';
import { buttonLayout } from '../src/ui/touch.js';
import { TOUCH, GAIT } from '../src/config/feel.js';
import { mulberry32 } from '../src/core/rng.js';
import { FIXED_DT } from '../src/core/loop.js';

test('touch stick: int16 quantization first, radial dead zone 0.12, saturation 0.95, curve 1.6, run past 0.85', () => {
  assert.equal(STICK_Q, 32767); assert.equal(quantizeAxis(1), 32767); assert.equal(quantizeAxis(-2), -32767);
  assert.ok(Number.isInteger(quantizeAxis(0.123456)));
  assert.deepEqual(shapeStick(quantizeAxis(0.11), 0), { mx: 0, mz: 0, gait: GAIT.walk, mag: quantizeAxis(0.11) / 32767 });
  const sat = shapeStick(quantizeAxis(0.96), 0); assert.equal(sat.mx, 1); assert.equal(sat.gait, GAIT.run);
  const mid = shapeStick(quantizeAxis(0.535), 0), t = (quantizeAxis(0.535) / 32767 - 0.12) / (0.95 - 0.12);
  assert.ok(Math.abs(mid.mx - Math.pow(t, 1.6)) < 1e-12); assert.equal(mid.gait, GAIT.walk);
  assert.equal(shapeStick(quantizeAxis(0.86), 0).gait, GAIT.run); assert.equal(shapeStick(quantizeAxis(0.84), 0).gait, GAIT.walk);
  // radial: same magnitude in any direction gives the same output magnitude
  const a = shapeStick(quantizeAxis(0.6), 0), b = shapeStick(quantizeAxis(0.6 / Math.SQRT2), quantizeAxis(0.6 / Math.SQRT2));
  assert.ok(Math.abs(Math.hypot(a.mx, a.mz) - Math.hypot(b.mx, b.mz)) < 1e-3);
  // quantized input -> identical output every call (pure)
  for (let i = 0; i < 100; i++) { const q = (i * 7919) % 65535 - 32767; assert.deepEqual(shapeStick(q, -q), shapeStick(q, -q)); }
});

test('touch buttons: sizes, positions and >= 48 px targets', () => {
  const L = buttonLayout(), B = TOUCH.buttons;
  assert.equal(L.dodge.size, 88); assert.equal(L.dodge.r - 44, B.marginPx); assert.equal(L.dodge.b - 44, B.marginPx);
  assert.ok(L.light.r > L.dodge.r && L.light.b === L.dodge.b && L.light.size === 76, 'light left of dodge');
  assert.ok(L.heavy.r === L.light.r && L.heavy.b > L.light.b && L.heavy.size === 64, 'heavy above light');
  assert.ok(L.fire.r === L.dodge.r && L.fire.b > L.dodge.b && L.fire.size === 64, 'fire above dodge');
  assert.ok(L.lock.size === 56 && L.lock.b > L.fire.b && L.lock.r <= L.fire.r, 'lock top-right');
  for (const p of Object.values(L)) assert.ok(p.size >= B.minTargetPx);
});

test('replay: quantized touch input (stick, sprint hold, buttons) bit-identical x2', async () => {
  await initRapier();
  const STEPS = 60 * 30, rng = mulberry32(4242);
  const script = []; let ax = 0, az = 0, sprint = false;
  for (let i = 0; i < STEPS; i++) {
    if (rng.next() < 0.05) { const a = rng.next() * Math.PI * 2, m = rng.next() * 1.1; ax = Math.cos(a) * m; az = Math.sin(a) * m; }
    if (rng.next() < 0.01) sprint = !sprint;
    script.push({ ax, az, sprint, dodge: rng.next() < 0.01, light: rng.next() < 0.01, heavy: rng.next() < 0.005, charged: rng.next() < 0.5, yaw: i * 0.003 });
  }
  const live = () => {
    const sc = buildScene({ seed: 9 }); let yaw = 0;
    const input = createInput({ getYaw: () => yaw }); input.startRecording();
    for (let i = 0; i < STEPS; i++) {
      const s = script[i]; yaw = s.yaw;
      input.setTouchStick(quantizeAxis(s.ax), quantizeAxis(s.az), true); input.setTouchSprint(s.sprint);
      if (s.dodge) input.pressDodge(); if (s.light) input.press('light'); if (s.heavy) input.press('heavy', { charged: s.charged });
      stepScene(sc, input.sample(i), FIXED_DT);
    }
    const out = { rec: input.stopRecording(), final: snapshot(sc) }; sc.phys.free(); return out;
  };
  const replay = (rec) => { const sc = buildScene({ seed: 9 }); const input = createInput(); input.replay(rec); for (let i = 0; i < STEPS; i++) stepScene(sc, input.sample(i), FIXED_DT); const f = snapshot(sc); sc.phys.free(); return f; };
  const a = live();
  assert.ok(a.rec.every((f) => Number.isInteger(f.qx) && Number.isInteger(f.qz) && Math.abs(f.qx) <= 32767), 'int16 axes recorded');
  assert.ok(a.rec.every((f) => { const t = shapeStick(f.qx, f.qz); return t.mx === f.mx && t.mz === f.mz; }), 'shaped axes are a pure function of the recorded ints');
  assert.ok(a.rec.some((f) => f.gait === GAIT.sprint) && a.rec.some((f) => f.gait === GAIT.run) && a.rec.some((f) => f.gait === GAIT.walk));
  const b = live();
  assert.deepEqual(b.rec, a.rec); assert.equal(b.final, a.final, 'live x2 identical');
  assert.equal(replay(a.rec), a.final); assert.equal(replay(a.rec), a.final);
  console.log(`# touch replay: ${STEPS} steps, ${a.rec.filter((f) => f.mx || f.mz).length} moving frames, bit-identical live x2 + replay x2`);
});
