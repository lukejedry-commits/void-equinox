import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initRapier } from './helpers.js';
import { buildScene, stepScene, WALL } from '../src/game/scene.js';
import { mulberry32 } from '../src/core/rng.js';
import { FIXED_DT } from '../src/core/loop.js';

const RUNS = 1000;
const face = WALL.x - WALL.halfThickness;
const R = 0.35; // capsule radius
// Tunnel = crossing the wall plane while inside the wall's z-footprint (going round the end is legal).
const through = (px, x, z) => px <= face && x > face && Math.abs(z) < WALL.halfDepth + R;
const touched = (x) => x >= face - R - 0.05;

function settle(scene, n = 30) { for (let i = 0; i < n; i++) stepScene(scene, { mx: 0, mz: 0, dodge: false }, FIXED_DT); }

test(`dodge into thin wall x${RUNS}: zero tunnelling`, async () => {
  await initRapier();
  const rng = mulberry32(777);
  let tunnels = 0, hits = 0, maxX = -Infinity;
  for (let r = 0; r < RUNS; r++) {
    const scene = buildScene({ seed: r, player: { x: rng.range(face - 3.5, face - 0.4), z: rng.range(-2.5, 2.5), heaviness: rng.next() } });
    settle(scene);
    let px = scene.player.position().x, hit = false;
    const mz = rng.int(-1, 1) * (rng.next() < 0.5 ? 1 : 0);
    for (let i = 0; i < 40; i++) {
      stepScene(scene, { mx: 1, mz, dodge: i === 0 || rng.next() < 0.1 }, FIXED_DT);
      const p = scene.player.position(), x = p.x;
      if (through(px, x, p.z)) { tunnels++; console.log(`# TUNNEL run ${r} step ${i} px=${px} x=${x} z=${p.z}`); break; }
      if (Math.abs(p.z) < WALL.halfDepth) maxX = Math.max(maxX, x);
      if (touched(x) && !hit) { hit = true; hits++; }
      px = x;
    }
    scene.phys.free();
  }
  console.log(`# dodge: ${RUNS} runs, wall contacts=${hits}, tunnels=${tunnels}, max x within wall span=${maxX.toFixed(4)} (wall face ${face})`);
  assert.equal(tunnels, 0);
});

test(`strong push into thin wall x${RUNS}: zero tunnelling`, async () => {
  await initRapier();
  const rng = mulberry32(999);
  let tunnels = 0, hits = 0, maxX = -Infinity;
  for (let r = 0; r < RUNS; r++) {
    const scene = buildScene({ seed: r, player: { x: rng.range(face - 3.5, face - 0.4), z: rng.range(-2.5, 2.5) } });
    settle(scene);
    let px = scene.player.position().x, hit = false;
    for (let i = 0; i < 10; i++) {
      // up to 60 m in a single step (3600 m/s) -- far beyond any real speed
      scene.player.pushRaw({ x: rng.range(1, 60), y: 0, z: rng.range(-0.05, 0.05) });
      scene.phys.step();
      const p = scene.player.position(), x = p.x;
      if (through(px, x, p.z)) { tunnels++; console.log(`# TUNNEL run ${r} step ${i} px=${px} x=${x} z=${p.z}`); break; }
      if (Math.abs(p.z) < WALL.halfDepth) maxX = Math.max(maxX, x);
      if (touched(x) && !hit) { hit = true; hits++; }
      px = x;
    }
    scene.phys.free();
  }
  console.log(`# push: ${RUNS} runs, wall contacts=${hits}, tunnels=${tunnels}, max x within wall span=${maxX.toFixed(4)}`);
  assert.equal(tunnels, 0);
});
