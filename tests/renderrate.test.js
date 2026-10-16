import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initRapier, bits } from './helpers.js';
import { buildScene, stepScene } from '../src/game/scene.js';
import { createLoop } from '../src/core/loop.js';
import { createInput } from '../src/core/input.js';

function dodgeAt(hz) {
  const scene = buildScene({ seed: 5, player: { x: -2, z: 6 } });
  const input = createInput();
  let clock = 0;
  const loop = createLoop({ step: (dt, tick) => stepScene(scene, input.sample(tick), dt), now: () => clock });
  const fdt = 1 / hz;
  let t = 0, pressed = false, steps = 0;
  while (t < 3) {
    if (!pressed && t >= 1) { input.setHeld('KeyW', true); input.pressDodge(); pressed = true; }
    loop.advance(fdt); t += fdt; steps += loop.stats.stepsThisFrame;
    if (pressed && t > 1.05) input.setHeld('KeyW', false);
  }
  const d = scene.player.state.lastDodgeDistance;
  scene.phys.free();
  return { d, steps };
}

test('fixed-step dodge distance identical at 30/60/144 Hz render', async () => {
  await initRapier();
  const r = [30, 60, 144].map((hz) => ({ hz, ...dodgeAt(hz) }));
  for (const x of r) console.log(`# ${x.hz} Hz: dodge distance=${x.d} bits=${bits(x.d)} steps=${x.steps}`);
  assert.ok(r[0].d > 0);
  assert.equal(bits(r[1].d), bits(r[0].d));
  assert.equal(bits(r[2].d), bits(r[0].d));
});

test('loop: max 4 catch-up steps then backlog dropped', () => {
  let n = 0; const loop = createLoop({ step: () => n++, now: () => 0 });
  const a = loop.advance(0.2);
  assert.equal(n, 4); assert.ok(a >= 0 && a < 1);
  loop.advance(1 / 60); assert.equal(n, 5);
});
