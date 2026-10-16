import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initRapier, bits } from './helpers.js';
import { buildScene, stepScene } from '../src/game/scene.js';
import { FIXED_DT } from '../src/core/loop.js';
import { KNOCKBACK, MOVEMENT, steps } from '../src/config/feel.js';

const idle = { mx: 0, mz: 0, dodge: false };
function run(speed, nSteps = 240, raw = false) {
  const scene = buildScene({ seed: 1, boxes: false, player: { x: 0, z: 0 } });
  for (let i = 0; i < 30; i++) stepScene(scene, idle, FIXED_DT);
  const p0 = scene.player.position();
  if (raw) scene.player.applyExternalRaw({ x: -speed, z: 0 }); // safety path: hard clamp only
  else scene.player.applyKnockback({ x: -speed, z: 0 }); // gameplay path; away from the wall, open ground
  const traj = [], maxH = { step: 0, ext: 0, vel: 0 };
  let px = p0.x, pz = p0.z, total = 0;
  maxH.ext = Math.hypot(scene.player.state.ext.x, scene.player.state.ext.z);
  for (let i = 0; i < nSteps; i++) {
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

const H = KNOCKBACK.hardClamp, G = KNOCKBACK.gameplayMax;
test('hard safety clamp: raw external push clamped to 84 m/s; 500 m/s == 84 m/s trajectory', async () => {
  await initRapier();
  const big = run(500, 240, true), ref = run(H, 240, true);
  console.log(`# raw push 500: maxStep=${big.maxH.step.toFixed(4)} maxExt=${big.maxH.ext} maxVel=${big.maxH.vel} travel=${big.total.toFixed(4)} | 84: travel=${ref.total.toFixed(4)}`);
  assert.equal(H, 84);
  assert.ok(big.maxH.step <= 1.4 + 1e-9, `step ${big.maxH.step}`);
  assert.ok(big.maxH.ext <= H + 1e-9, `ext ${big.maxH.ext}`);
  assert.ok(big.maxH.vel <= H + 1e-9, `vel ${big.maxH.vel}`);
  assert.ok(big.total > 5, `push moved ${big.total}`);
  assert.deepEqual(big.ext, { x: 0, z: 0 }, 'external velocity fully decayed');
  assert.equal(big.traj.length, ref.traj.length);
  assert.deepEqual(big.traj, ref.traj, 'identical bitwise trajectory');
  assert.equal(big.total, ref.total);
});

test('gameplay knockback clamped to 9 m/s (500 == 84 == 9 bitwise); hit kinds 2.5/5/8; damping 6/s; stagger <= 0.4 s', async () => {
  await initRapier();
  const big = run(500), mid = run(H), ref = run(G);
  console.log(`# knockback 500: maxExt=${big.maxH.ext} travel=${big.total.toFixed(4)} | 9: travel=${ref.total.toFixed(4)}`);
  assert.ok(big.maxH.ext <= G + 1e-9, `ext ${big.maxH.ext}`);
  assert.ok(big.maxH.step <= G / 60 + 1e-6, `step ${big.maxH.step}`); // f32 positions
  assert.deepEqual(big.ext, { x: 0, z: 0 });
  assert.deepEqual(big.traj, ref.traj); assert.deepEqual(mid.traj, ref.traj);
  assert.ok(ref.total > 1, `moved ${ref.total}`);
  for (const [kind, v] of [['light', 2.5], ['heavy', 5], ['bossSlam', 8]]) {
    const sc = buildScene({ seed: 1, boxes: false, player: { x: 0, z: 0 } });
    for (let i = 0; i < 30; i++) stepScene(sc, idle, FIXED_DT);
    sc.player.hit(kind, { x: -1, z: 0 });
    const s = sc.player.state;
    assert.equal(KNOCKBACK[kind], v); assert.ok(Math.abs(Math.hypot(s.ext.x, s.ext.z) - v) < 1e-9, kind);
    assert.ok(s.staggerLeft > 0 && s.staggerLeft <= steps(KNOCKBACK.staggerMaxSec), `${kind} stagger ${s.staggerLeft}`);
    const e0 = Math.hypot(s.ext.x, s.ext.z); stepScene(sc, { mx: 1, mz: 0, dodge: true }, FIXED_DT);
    assert.ok(Math.abs(Math.hypot(s.ext.x, s.ext.z) - e0 * (1 - KNOCKBACK.damping * FIXED_DT)) < 1e-9, 'damping 6/s');
    assert.equal(s.dodgeLeft, 0, 'input locked while staggered'); assert.equal(Math.hypot(s.vel.x, s.vel.z), 0);
    let n = 1; while (s.staggerLeft > 0) { stepScene(sc, idle, FIXED_DT); n++; }
    assert.ok(n <= steps(KNOCKBACK.staggerMaxSec), `${kind}: stagger ${n} steps`);
    sc.phys.free();
  }
  // Repeated hits never exceed the gameplay cap
  const sc = buildScene({ seed: 1, boxes: false, player: { x: 0, z: 0 } });
  for (let i = 0; i < 5; i++) sc.player.hit('bossSlam', { x: -1, z: 0 });
  assert.ok(Math.hypot(sc.player.state.ext.x, sc.player.state.ext.z) <= G + 1e-9);
  assert.ok(MOVEMENT.walk < G); sc.phys.free();
});
