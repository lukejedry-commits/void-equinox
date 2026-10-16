import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initRapier, snapshot } from './helpers.js';
import { buildScene, stepScene } from '../src/game/scene.js';
import { createInput, randomInputLog } from '../src/core/input.js';
import { mulberry32 } from '../src/core/rng.js';
import { FIXED_DT } from '../src/core/loop.js';

const STEPS = 60 * 60; // 60 s at 60 Hz

function run(log, record) {
  const scene = buildScene({ seed: 42 });
  const input = createInput();
  if (record) { input.replay(log); input.startRecording(); } else input.replay(log);
  const trace = [];
  for (let i = 0; i < STEPS; i++) {
    stepScene(scene, input.sample(i), FIXED_DT);
    if (i % 60 === 59) trace.push(snapshot(scene));
  }
  const rec = record ? input.stopRecording() : null;
  const final = snapshot(scene); scene.phys.free();
  return { trace, final, rec };
}

test('replay determinism: 60 s seeded input, replay twice, bit-identical', async () => {
  await initRapier();
  const log = randomInputLog(mulberry32(20261016), STEPS);
  const a = run(log, true);
  const b = run(a.rec, false);
  const c = run(a.rec, false);
  assert.equal(a.rec.length, STEPS);
  assert.deepEqual(b.trace, a.trace);
  assert.deepEqual(c.trace, a.trace);
  assert.equal(b.final, a.final); assert.equal(c.final, a.final);
  console.log(`# determinism: ${STEPS} steps, ${a.trace.length} checkpoints, ${log.filter((f) => f.dodge).length} dodges, final hash identical x3`);
});
