import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initRapier } from './helpers.js';
import { buildScene, stepScene } from '../src/game/scene.js';
import { FIXED_DT } from '../src/core/loop.js';
import { DODGE, steps } from '../src/config/feel.js';

const idle = { mx: 0, mz: 0, dodge: false };
test('dodge: 2.8 m / 0.55 s, i-frames 0.08-0.38 s, 0.15 s recovery cancellable only by dodge', async () => {
  await initRapier();
  const scene = buildScene({ seed: 1, boxes: false, player: { x: 0, z: 8 } });
  for (let i = 0; i < 30; i++) stepScene(scene, idle, FIXED_DT);
  const s = scene.player.state, ifr = [];
  stepScene(scene, { mx: 0, mz: -1, dodge: true }, FIXED_DT); ifr.push(s.iframes);
  for (let i = 1; i < steps(DODGE.durationSec); i++) { stepScene(scene, { mx: 0, mz: -1, dodge: false }, FIXED_DT); ifr.push(s.iframes); }
  assert.equal(s.dodgeLeft, 0);
  assert.ok(Math.abs(s.lastDodgeDistance - DODGE.distance) / DODGE.distance < 0.01, `distance ${s.lastDodgeDistance}`);
  // i-frames flag during step k covers t in [k/60, (k+1)/60): on for k in [5, 23)
  ifr.forEach((on, k) => assert.equal(on, k >= steps(DODGE.iframeStartSec) && k < steps(DODGE.iframeEndSec), `step ${k}`));
  // Recovery: movement input is ignored...
  const p0 = scene.player.position();
  stepScene(scene, { mx: 1, mz: 0, dodge: false }, FIXED_DT);
  assert.ok(s.dodgeRecovery === steps(DODGE.recoverySec) - 1, `recovery ${s.dodgeRecovery}`);
  assert.ok(Math.abs(scene.player.position().x - p0.x) < 1e-6, 'no movement during recovery');
  // ...but a dodge cancels it.
  stepScene(scene, { mx: 1, mz: 0, dodge: true }, FIXED_DT);
  assert.equal(s.dodgeRecovery, 0); assert.equal(s.dodgeLeft, steps(DODGE.durationSec) - 1);
  scene.phys.free();
});
