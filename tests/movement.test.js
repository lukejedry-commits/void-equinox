import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initRapier } from './helpers.js';
import { buildScene, stepScene } from '../src/game/scene.js';
import { FIXED_DT } from '../src/core/loop.js';
import { MOVEMENT, GAIT, steps } from '../src/config/feel.js';

const sp = (s) => Math.hypot(s.vel.x, s.vel.z);
test('movement: walk/run/sprint top speeds, accel 0.15 s, decel 0.1 s (feel.js)', async () => {
  await initRapier();
  for (const [gait, top] of [[GAIT.walk, MOVEMENT.walk], [GAIT.run, MOVEMENT.run], [GAIT.sprint, MOVEMENT.sprint]]) {
    const scene = buildScene({ seed: 1, boxes: false, player: { x: 0, z: 8 } });
    for (let i = 0; i < 30; i++) stepScene(scene, { mx: 0, mz: 0, dodge: false }, FIXED_DT);
    const s = scene.player.state, go = { mx: 0, mz: -1, dodge: false, gait };
    for (let i = 0; i < steps(MOVEMENT.accelSec) - 1; i++) stepScene(scene, go, FIXED_DT);
    assert.ok(sp(s) < top, `not yet full before ${MOVEMENT.accelSec} s`);
    stepScene(scene, go, FIXED_DT);
    assert.ok(Math.abs(sp(s) - top) < 1e-9, `gait ${gait}: ${sp(s)} == ${top} at ${MOVEMENT.accelSec} s`);
    for (let i = 0; i < 30; i++) stepScene(scene, go, FIXED_DT);
    assert.ok(Math.abs(sp(s) - top) < 1e-9, 'holds top speed');
    for (let i = 0; i < steps(MOVEMENT.decelSec); i++) stepScene(scene, { mx: 0, mz: 0, dodge: false, gait }, FIXED_DT);
    assert.ok(sp(s) < 1e-9, `stopped within ${MOVEMENT.decelSec} s (${sp(s)})`);
    scene.phys.free();
  }
});
