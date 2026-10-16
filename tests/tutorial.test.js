import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initRapier } from './helpers.js';
import { buildScene, stepScene } from '../src/game/scene.js';
import { FIXED_DT } from '../src/core/loop.js';
import { MOVEMENT, TUTORIAL, GAIT } from '../src/config/feel.js';

test('intro tutorial flag: speeds x0.5 and dodge disabled until the first stand', async () => {
  await initRapier();
  const sc = buildScene({ seed: 1, boxes: false, tutorial: true, player: { x: 0, z: 8 } });
  const s = sc.player.state;
  for (let i = 0; i < 30; i++) stepScene(sc, { mx: 0, mz: 0, dodge: false }, FIXED_DT);
  for (const [gait, top] of [[GAIT.walk, MOVEMENT.walk], [GAIT.run, MOVEMENT.run], [GAIT.sprint, MOVEMENT.sprint]]) {
    for (let i = 0; i < 40; i++) stepScene(sc, { mx: 0, mz: -1, dodge: false, gait }, FIXED_DT);
    assert.ok(Math.abs(Math.hypot(s.vel.x, s.vel.z) - top * TUTORIAL.speedScale) < 1e-9, `gait ${gait}`);
  }
  const v = s.stamina.value;
  stepScene(sc, { mx: 0, mz: -1, dodge: true }, FIXED_DT);
  assert.equal(s.dodgeLeft, 0, 'no dodge in the tutorial'); assert.ok(s.stamina.value >= v - 1, 'and no stamina spent on it');
  sc.player.reachFirstStand();
  for (let i = 0; i < 40; i++) stepScene(sc, { mx: 0, mz: -1, dodge: false }, FIXED_DT);
  assert.ok(Math.abs(Math.hypot(s.vel.x, s.vel.z) - MOVEMENT.run) < 1e-9, 'full speed after the first stand');
  stepScene(sc, { mx: 0, mz: -1, dodge: true }, FIXED_DT);
  assert.ok(s.dodgeLeft > 0, 'dodge enabled after the first stand');
  sc.phys.free();
});
