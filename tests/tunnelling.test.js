import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initRapier, penetration } from './helpers.js';
import { strongPush } from './pushScenario.js';
import { buildScene, stepScene, WALL } from '../src/game/scene.js';
import { mulberry32 } from '../src/core/rng.js';
import { FIXED_DT } from '../src/core/loop.js';

const RUNS = 1000;
const face = WALL.x - WALL.halfThickness;
const R = 0.35; // capsule radius
// Tunnel = crossing the wall plane while inside the wall's z-footprint (going round the end is legal).
const through = (px, x, z) => px <= face && x > face && Math.abs(z) < WALL.halfDepth + R;
const touched = (x) => x >= face - R - 0.05;
const OFFSET = 0.02; // KCC offset: allowed penetration into static geometry
const pen = { stat: 0, dyn: 0, statAt: '' };
function trackPen(acc, scene, tag) {
  const p = penetration(scene);
  if (p.stat > acc.stat) { acc.stat = p.stat; acc.statAt = tag; }
  acc.dyn = Math.max(acc.dyn, p.dyn);
}

function settle(scene, n = 30) { for (let i = 0; i < n; i++) stepScene(scene, { mx: 0, mz: 0, dodge: false }, FIXED_DT); }

test(`dodge into thin wall x${RUNS}: zero tunnelling`, async () => {
  await initRapier();
  const rng = mulberry32(777);
  let tunnels = 0, hits = 0, maxX = -Infinity;
  const pa = { stat: 0, dyn: 0, statAt: '' };
  for (let r = 0; r < RUNS; r++) {
    const scene = buildScene({ seed: r, player: { x: rng.range(face - 3.5, face - 0.4), z: rng.range(-2.5, 2.5), heaviness: rng.next() } });
    settle(scene);
    let px = scene.player.position().x, hit = false;
    const mz = rng.int(-1, 1) * (rng.next() < 0.5 ? 1 : 0);
    for (let i = 0; i < 40; i++) {
      stepScene(scene, { mx: 1, mz, dodge: i === 0 || rng.next() < 0.1 }, FIXED_DT);
      trackPen(pa, scene, `run ${r} step ${i}`);
      const p = scene.player.position(), x = p.x;
      if (through(px, x, p.z)) { tunnels++; console.log(`# TUNNEL run ${r} step ${i} px=${px} x=${x} z=${p.z}`); break; }
      if (Math.abs(p.z) < WALL.halfDepth) maxX = Math.max(maxX, x);
      if (touched(x) && !hit) { hit = true; hits++; }
      px = x;
    }
    scene.phys.free();
  }
  console.log(`# dodge: ${RUNS} runs, wall contacts=${hits}, tunnels=${tunnels}, max x within wall span=${maxX.toFixed(4)} (wall face ${face})`);
  console.log(`# dodge: max static penetration=${pa.stat.toFixed(4)} m (${pa.statAt}), max dynamic-box penetration=${pa.dyn.toFixed(4)} m (not asserted)`);
  assert.equal(tunnels, 0);
  assert.ok(pa.stat <= OFFSET, `static penetration ${pa.stat} > ${OFFSET}`);
});

// 60 m strong-push stress: 100 seeds in `npm test`, STRESS_SEEDS (e.g. 1000) nightly.
const STRESS = Number(process.env.STRESS_SEEDS || 100);
test(`strong push (<=60 m/step) into thin wall x${STRESS}: zero tunnelling, clamp holds`, async () => {
  await initRapier();
  const { cl, tunnels, hits, maxX, maxY, maxPen, above, wallTop, pa } = strongPush({ runs: STRESS });
  const RUNS = STRESS;
  console.log(`# push: max centre y=${maxY.toFixed(4)} (wall top ${wallTop}), runs ending above wall top=${above}, max penetration into face=${maxPen.toFixed(4)} m`);
  console.log(`# push: ${RUNS} runs, wall contacts=${hits}, tunnels=${tunnels}, max x within wall span=${maxX.toFixed(4)}`);
  console.log(`# push: max static penetration=${pa.stat.toFixed(4)} m (${pa.statAt}), max dynamic-box penetration=${pa.dyn.toFixed(4)} m (not asserted)`);
  console.log(`# push clamp: steps=${cl.steps}, clamped=${cl.clamped}, max sub-moves/step=${cl.maxN}, max sub-move=${cl.maxSubLen.toFixed(5)} m, max horizontal request=${cl.maxH.toFixed(5)} m, violations=${cl.violations}`);
  assert.equal(cl.violations, 0);
  assert.ok(cl.maxN <= 8);
  assert.equal(tunnels, 0);
  assert.equal(above, 0);
  assert.ok(maxY <= wallTop);
  assert.ok(pa.stat <= OFFSET, `static penetration ${pa.stat} > ${OFFSET}`);
});

test('slide along wall at shallow angle (10 deg): keeps moving tangentially', async () => {
  await initRapier();
  const scene = buildScene({ seed: 3, player: { x: face - R - 0.05, z: -3.2 } });
  settle(scene);
  const a = 10 * Math.PI / 180, v = 6 * FIXED_DT; // 6 m/s
  const p0 = scene.player.position();
  const z0 = p0.z; let maxX = -Infinity, stalls = 0, prevZ = z0;
  const N = 45;
  const pa = { stat: 0, dyn: 0, statAt: '' };
  for (let i = 0; i < N; i++) {
    scene.player.pushRaw({ x: v * Math.sin(a), y: 0, z: v * Math.cos(a) });
    scene.phys.step();
    trackPen(pa, scene, `step ${i}`);
    const p = scene.player.position();
    maxX = Math.max(maxX, p.x);
    if (p.z - prevZ < 0.25 * v * Math.cos(a)) { stalls++; console.log(`# SLIDE STALL step ${i} dz=${p.z - prevZ} x=${p.x}`); }
    prevZ = p.z;
  }
  const slid = scene.player.position().z - z0, ideal = N * v * Math.cos(a);
  console.log(`# slide: tangential=${slid.toFixed(4)} m of ideal ${ideal.toFixed(4)} (${(100 * slid / ideal).toFixed(1)}%), stalled steps=${stalls}/${N}, stall retries=${scene.player.stallRetries()}, max x=${maxX.toFixed(4)} (face-R=${(face - R).toFixed(4)})`);
  console.log(`# slide: max static penetration=${pa.stat.toFixed(4)} m, max dynamic-box penetration=${pa.dyn.toFixed(4)} m (not asserted)`);
  scene.phys.free();
  assert.ok(pa.stat <= OFFSET, `static penetration ${pa.stat} > ${OFFSET}`);
  assert.ok(maxX >= face - R - 0.05, 'never reached the wall');
  assert.ok(maxX <= face - R + 0.005, 'penetrated wall');
  assert.equal(stalls, 0);
  assert.ok(slid > 0.9 * ideal);
});

test(`thin pillar (0.1 m) off-centre big pushes x${RUNS}: zero pass-throughs`, async () => {
  await initRapier();
  const rng = mulberry32(4242);
  const PR = 0.05, PX = -15, PZ = -10, reach = R + PR;
  let passes = 0, maxPen = 0, contacts = 0, roundedOff = 0;
  for (let r = 0; r < RUNS; r++) {
    const scene = buildScene({ seed: r, player: { x: PX + rng.range(-0.9, 0.9) * reach, z: PZ + rng.range(1.0, 3.0) } });
    const { RAPIER } = scene.phys;
    scene.phys.add(RAPIER.RigidBodyDesc.fixed().setTranslation(PX, 1.5, PZ), RAPIER.ColliderDesc.cylinder(1.5, PR), 'pillar');
    settle(scene, 10);
    let p = scene.player.position(), prev = { x: p.x, z: p.z }, hit = false;
    for (let i = 0; i < 10; i++) {
      scene.player.pushRaw({ x: 0, y: 0, z: -rng.range(1, 60) });
      scene.phys.step();
      p = scene.player.position();
      const off0 = Math.abs(prev.x - PX), off1 = Math.abs(p.x - PX);
      // Pass-through: crossed the pillar's z while still laterally overlapping it.
      if (prev.z > PZ && p.z <= PZ && off1 < reach - 1e-3) { passes++; console.log(`# PILLAR PASS run ${r} step ${i} prev=${JSON.stringify(prev)} now=(${p.x},${p.z})`); break; }
      const d = Math.hypot(p.x - PX, p.z - PZ);
      maxPen = Math.max(maxPen, reach - d);
      if (d < reach + 0.05) hit = true;
      prev = { x: p.x, z: p.z };
    }
    if (hit) contacts++;
    if (p.z < PZ) roundedOff++;
    scene.phys.free();
  }
  console.log(`# pillar: ${RUNS} runs, contacts=${contacts}, slid round (legal)=${roundedOff}, pass-throughs=${passes}, max penetration=${maxPen.toFixed(4)} m`);
  assert.equal(passes, 0);
});
