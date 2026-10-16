import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initRapier } from './helpers.js';
import { buildScene, stepScene, WALL } from '../src/game/scene.js';
import { FIXED_DT } from '../src/core/loop.js';
import { KNOCKBACK } from '../src/config/feel.js';
import { PLAYER_TUNING } from '../src/player/controller.js';

const idle = { mx: 0, mz: 0, dodge: false };
test('knockback into thin wall: into-wall ext removed on contact, walk-away moves away next step', async () => {
  await initRapier();
  const scene = buildScene({ seed: 1, boxes: false, player: { x: WALL.x - 1.5, z: 0 } });
  for (let i = 0; i < 30; i++) stepScene(scene, idle, FIXED_DT);
  scene.player.applyKnockback({ x: KNOCKBACK.gameplayMax, z: 0 }); // max gameplay knockback toward the wall (+x)
  let contactStep = -1;
  for (let i = 0; i < 60; i++) {
    stepScene(scene, idle, FIXED_DT);
    // wall contact: capsule within 3 cm of the wall face (KCC skin is 2 cm), not just the ground contact
    if (scene.player.kcc.numComputedCollisions() > 0 && scene.player.position().x > WALL.x - WALL.halfThickness - PLAYER_TUNING.radius - 0.03) { contactStep = i; break; }
  }
  assert.ok(contactStep >= 0, 'reached wall');
  const extX = scene.player.state.ext.x;
  const x0 = scene.player.position().x;
  stepScene(scene, { mx: -1, mz: 0, dodge: false }, FIXED_DT); // walk away (-x)
  const x1 = scene.player.position().x;
  console.log(`# wallknock: contact step ${contactStep}, x at contact ${x0.toFixed(4)} (wall face ${(WALL.x - WALL.halfThickness).toFixed(2)}), ext.x after contact ${extX}, next-step dx ${(x1 - x0).toFixed(5)}`);
  assert.ok(Math.abs(Math.max(0, extX)) < 1e-6, `into-wall ext ${extX}`);
  assert.ok(x1 < x0, `moved away: ${x0} -> ${x1}`);
  scene.phys.free();
});
