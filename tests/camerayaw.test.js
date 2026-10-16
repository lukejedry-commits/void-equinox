import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initRapier, snapshot } from './helpers.js';
import { buildScene, stepScene } from '../src/game/scene.js';
import { createInput, randomInputLog } from '../src/core/input.js';
import { createTPSCamera, CAMERA_TUNING } from '../src/render/camera.js';
import { mulberry32 } from '../src/core/rng.js';
import { FIXED_DT } from '../src/core/loop.js';

const STEPS = 60 * 30;
// Live camera is render-side: orbit it with a scripted "mouse" each step; the
// input layer quantizes its yaw into each recorded frame.
function run({ base, replayLog = null, tuning = CAMERA_TUNING, orbitSeed = 7 }) {
  const scene = buildScene({ seed: 42, dummy: true });
  const cam = createTPSCamera({ phys: scene.phys, tuning, targets: [] });
  const input = createInput({ getYaw: () => cam.yaw });
  const rng = mulberry32(orbitSeed);
  let i = 0;
  // Live run: movement/dodge axes come from `base`; yaw comes from the live camera.
  if (replayLog) input.replay(replayLog);
  input.startRecording();
  const trace = [];
  for (i = 0; i < STEPS; i++) {
    cam.orbit((rng.next() - 0.45) * 0.08);
    const p = scene.phys.get(scene.player.id).curr.p;
    cam.update(FIXED_DT, p);
    let f;
    if (replayLog) f = input.sample(i);
    else { input.setHeld('KeyW', base[i].mz < 0); input.setHeld('KeyS', base[i].mz > 0); input.setHeld('KeyA', base[i].mx < 0); input.setHeld('KeyD', base[i].mx > 0); if (base[i].dodge) input.pressDodge(); f = input.sample(i); }
    stepScene(scene, f, FIXED_DT);
    if (i % 60 === 59) trace.push(snapshot(scene));
  }
  const rec = input.stopRecording(), final = snapshot(scene);
  scene.phys.free();
  return { trace, final, rec };
}

test('camera yaw: replay uses recorded quantized yaw, bit-identical regardless of live camera smoothing', async () => {
  await initRapier();
  const base = randomInputLog(mulberry32(99), STEPS);
  const a = run({ base });
  const nonzero = a.rec.filter((f) => f.yawQ !== 0).length;
  assert.ok(nonzero > STEPS / 2, `camera yaw actually recorded (${nonzero})`);
  const slow = { ...CAMERA_TUNING, rotSmoothing: 2, posSmoothing: 3 };
  const fast = { ...CAMERA_TUNING, rotSmoothing: 60, posSmoothing: 60 };
  const r1 = run({ base, replayLog: a.rec, tuning: slow, orbitSeed: 1 });
  const r2 = run({ base, replayLog: a.rec, tuning: fast, orbitSeed: 2 });
  assert.deepEqual(r1.trace, a.trace); assert.equal(r1.final, a.final);
  assert.deepEqual(r2.trace, a.trace); assert.equal(r2.final, a.final);
  assert.deepEqual(r1.rec, a.rec); // replayed frames == recorded frames
  // Sanity: a LIVE run with different smoothing really yields different yaw/motion,
  // so the equality above is because replay ignores the live camera.
  const b = run({ base, tuning: slow });
  const diffYaw = b.rec.filter((f, k) => f.yawQ !== a.rec[k].yawQ).length;
  assert.ok(diffYaw > 0); assert.notEqual(b.final, a.final);
  console.log(`# camera yaw: ${STEPS} steps, ${nonzero} non-zero yawQ, replay x2 (smoothing 2/s & 60/s) bit-identical; live slow-smoothing run differs in ${diffYaw} yaw frames`);
});
