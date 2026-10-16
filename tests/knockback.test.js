import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initRapier, bits } from './helpers.js';
import { buildScene, stepScene } from '../src/game/scene.js';
import { FIXED_DT } from '../src/core/loop.js';

const idle = { mx: 0, mz: 0, dodge: false };
function run(speed, steps = 240) {
  const scene = buildScene({ seed: 1, boxes: false, player: { x: 0, z: 0 } });
  for (let i = 0; i < 30; i++) stepScene(scene, idle, FIXED_DT);
  const p0 = scene.player.position();
  scene.player.applyKnockback({ x: -speed, z: 0 }); // away from the wall, open ground
  const traj = [], maxH = { step: 0, ext: 0, vel: 0 };
  let px = p0.x, pz = p0.z, total = 0;
  maxH.ext = Math.hypot(scene.player.state.ext.x, scene.player.state.ext.z);
  for (let i = 0; i < steps; i++) {
    stepScene(scene, idle, FIXED_DT);
    const p = scene.player.position(), s = scene.player.state;
    const h = Math.hypot(p.x - px, p.z - pz);
    total += h; maxH.step = Math.max(maxH.step, h);
    maxH.ext = Math.max(maxH.ext, Math.hypot(s.ext.x, s.ext.z));
    maxH.vel = Math.max(maxH.vel, Math.hypot(s.vel.x, s.vel.z));
    traj.push([p.x, p.y, p.z].map(bits).join(','));
    px = p.x; pz = p.z;
  }
  const end = scene.player.position(), ext = { ...scene.player.state.ext };
  scene.phys.free();
  return { traj, maxH, total, disp: Math.hypot(end.x - p0.x, end.z - p0.z), ext };
}

test('knockback velocity clamped to 84 m/s; 500 m/s == 84 m/s trajectory', async () => {
  await initRapier();
  const big = run(500), ref = run(84);
  console.log(`# knockback 500: maxStep=${big.maxH.step.toFixed(4)} maxExt=${big.maxH.ext} maxVel=${big.maxH.vel} travel=${big.total.toFixed(4)} | 84: travel=${ref.total.toFixed(4)}`);
  assert.ok(big.maxH.step <= 1.4 + 1e-9, `step ${big.maxH.step}`);
  assert.ok(big.maxH.ext <= 84 + 1e-9, `ext ${big.maxH.ext}`);
  assert.ok(big.maxH.vel <= 84 + 1e-9, `vel ${big.maxH.vel}`);
  assert.ok(big.total > 5, `knockback moved ${big.total}`);
  assert.deepEqual(big.ext, { x: 0, z: 0 }, 'external velocity fully decayed');
  assert.equal(big.traj.length, ref.traj.length);
  assert.deepEqual(big.traj, ref.traj, 'identical bitwise trajectory');
  assert.equal(big.total, ref.total);
});
