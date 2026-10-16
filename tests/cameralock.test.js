import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initRapier } from './helpers.js';
import { buildScene, WALL } from '../src/game/scene.js';
import { createTPSCamera, CAMERA_TUNING } from '../src/render/camera.js';
import { CAMERA } from '../src/config/feel.js';

const DT = 1 / 60;
test('camera: lock-on breaks only after line of sight is lost > 1.0 s; feel.js sensitivities', async () => {
  await initRapier();
  assert.ok(Math.abs(CAMERA_TUNING.mouseSens - 0.12 * Math.PI / 180) < 1e-15);
  assert.ok(Math.abs(CAMERA_TUNING.stickYawSens - Math.PI) < 1e-12 && Math.abs(CAMERA_TUNING.stickPitchSens - 120 * Math.PI / 180) < 1e-12);
  assert.ok(Math.abs(CAMERA_TUNING.rotSmoothing - 1 / 0.08) < 1e-12);
  const scene = buildScene({ seed: 1, boxes: false }); scene.phys.step(); // populate the query pipeline
  const player = { x: WALL.x - 2, y: 1, z: 0 };
  let tgt = { x: WALL.x + 3, y: 1, z: 0, radius: 0.4 }; // behind the wall
  let locked = null;
  const cam = createTPSCamera({ phys: scene.phys, targets: [{ position: () => tgt, onLock: (on) => { locked = on; } }] });
  cam.update(DT, player); cam.toggleLock(); assert.equal(locked, true);
  let t = 0; while (cam.locked && t < 3) { cam.update(DT, player); t += DT; }
  assert.equal(locked, false, 'lock broke');
  assert.ok(t > CAMERA.lockLosBreakSec && t <= CAMERA.lockLosBreakSec + 2 * DT, `broke after ${t.toFixed(3)} s`);
  // Brief occlusion (< 1 s) does not break the lock.
  tgt = { x: WALL.x - 2, y: 1, z: -5, radius: 0.4 }; // open ground, visible
  cam.toggleLock(); assert.equal(locked, true);
  for (let i = 0; i < 60 * 2; i++) cam.update(DT, player);
  assert.ok(cam.locked, 'stays locked with LOS');
  const vis = tgt; tgt = { x: WALL.x + 3, y: 1, z: 0, radius: 0.4 };
  for (let i = 0; i < 45; i++) cam.update(DT, player); // 0.75 s hidden
  tgt = vis; for (let i = 0; i < 60; i++) cam.update(DT, player);
  assert.ok(cam.locked, 'short occlusion keeps the lock'); assert.equal(cam.losLost, 0);
  scene.phys.free();
});
