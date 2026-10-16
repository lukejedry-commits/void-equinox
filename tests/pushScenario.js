import { penetration } from './helpers.js';
import { buildScene, WALL } from '../src/game/scene.js';
import { mulberry32 } from '../src/core/rng.js';
import { FIXED_DT } from '../src/core/loop.js';

const face = WALL.x - WALL.halfThickness;
const R = 0.35;
const through = (px, x, z) => px <= face && x > face && Math.abs(z) < WALL.halfDepth + R;
const touched = (x) => x >= face - R - 0.05;
function settle(scene, n = 30) { for (let i = 0; i < n; i++) { scene.player.update({ mx: 0, mz: 0, dodge: false }, FIXED_DT); scene.phys.step(); } }
function trackPen(acc, scene, tag) {
  const p = penetration(scene);
  if (p.stat > acc.stat) { acc.stat = p.stat; acc.statAt = tag; }
  acc.dyn = Math.max(acc.dyn, p.dyn);
}

// Strong-push scenario, parameterised for the penetration isolation runs.
export function strongPush({ runs = 1000, boxes = true, impulses = true, log = true } = {}) {
  const rng = mulberry32(999);
  let tunnels = 0, hits = 0, maxX = -Infinity, maxY = -Infinity, maxPen = 0, above = 0;
  const pa = { stat: 0, dyn: 0, statAt: '' };
  const cl = { maxN: 0, maxSubLen: 0, maxH: 0, violations: 0, clamped: 0, steps: 0 };
  const wallTop = 2 * WALL.halfHeight;
  for (let r = 0; r < runs; r++) {
    const scene = buildScene({ seed: r, boxes, player: { x: rng.range(face - 3.5, face - 0.4), z: rng.range(-2.5, 2.5) } });
    scene.player.kcc.setApplyImpulsesToDynamicBodies(impulses);
    settle(scene);
    let px = scene.player.position().x, hit = false;
    for (let i = 0; i < 10; i++) {
      // up to 60 m in a single step (3600 m/s) -- far beyond any real speed
      scene.player.pushRaw({ x: rng.range(1, 60), y: 0, z: rng.range(-0.05, 0.05) });
      scene.phys.step();
      trackPen(pa, scene, `run ${r} step ${i}`);
      { const ms = scene.player.moveStats, c = ms.lastClamped, h = Math.hypot(c.x, c.z);
        cl.steps++; cl.maxN = Math.max(cl.maxN, ms.lastN); cl.maxSubLen = Math.max(cl.maxSubLen, ms.lastSubLen); cl.maxH = Math.max(cl.maxH, h);
        if (ms.lastN > 8 || ms.lastSubLen > 0.175 + 1e-9 || h > 1.4 + 1e-9) { cl.violations++; if (log) console.log(`# CLAMP VIOLATION run ${r} step ${i} n=${ms.lastN} sub=${ms.lastSubLen} h=${h}`); } }
      const p = scene.player.position(), x = p.x;
      if (through(px, x, p.z)) { tunnels++; if (log) console.log(`# TUNNEL run ${r} step ${i} px=${px} x=${x} z=${p.z}`); break; }
      if (Math.abs(p.z) < WALL.halfDepth) maxX = Math.max(maxX, x);
      if (Math.abs(p.z) < WALL.halfDepth - R) { const pen = x - (face - R); if (log && pen > 0.03) console.log(`# PEN run ${r} step ${i} pen=${pen.toFixed(4)} x=${x} y=${p.y} z=${p.z}`); maxPen = Math.max(maxPen, pen); } // capsule fully in front of face
      maxY = Math.max(maxY, p.y);
      if (p.y > wallTop) { above++; if (log) console.log(`# ABOVE WALL run ${r} step ${i} y=${p.y}`); break; }
      if (touched(x) && !hit) { hit = true; hits++; }
      px = x;
    }
    cl.clamped += scene.player.moveStats.clampedSteps;
    scene.phys.free();
  }
  return { cl, tunnels, hits, maxX, maxY, maxPen, above, wallTop, pa };
}

