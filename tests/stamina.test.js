import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initRapier, snapshot } from './helpers.js';
import { createStamina } from '../src/sim/stamina.js';
import { STAMINA as S, MOVEMENT, steps } from '../src/config/feel.js';
import { buildScene, stepScene } from '../src/game/scene.js';
import { mulberry32 } from '../src/core/rng.js';
import { FIXED_DT } from '../src/core/loop.js';

const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;
const run = (st, n, o) => { for (let i = 0; i < n; i++) st.step(o); };

test('stamina: costs, 0.8 s regen delay, 18/s regen, 12/s while fire lit', () => {
  const st = createStamina();
  assert.equal(st.value, S.max);
  assert.ok(st.dodge()); assert.equal(st.value, 80);
  assert.ok(st.light()); assert.equal(st.value, 68);
  assert.ok(st.heavy()); assert.equal(st.value, 40);
  run(st, steps(S.regenDelaySec)); assert.equal(st.value, 40, 'no regen during the 0.8 s delay');
  run(st, 60); assert.ok(near(st.value, 40 + S.regenPerSec, 1e-6), `18/s: ${st.value}`);
  const lit = createStamina(); lit.heavy(); run(lit, steps(S.regenDelaySec) + 60, { fireLit: true });
  assert.ok(near(lit.value, 72 + S.regenFireLitPerSec, 1e-6), `12/s lit: ${lit.value}`);
});

test('stamina: fire 25 + 15 per chained cast within 6 s; chain resets after 6 s', () => {
  const st = createStamina();
  assert.equal(st.fireCost(), 25); st.castFire(); assert.equal(st.value, 75);
  run(st, 60); assert.equal(st.fireCost(), 40); st.castFire();
  run(st, 60); assert.equal(st.fireCost(), 55);
  const v = st.value; run(st, steps(S.fire.chainWindowSec) + 1); assert.equal(st.fireCost(), 25, 'chain expired');
  assert.ok(st.value > v);
});

test('stamina: sprint 12/s; at 0 -> 1.2 s exhaustion (actions refused) then half-rate regen until full', () => {
  const st = createStamina();
  run(st, 60, { sprinting: true }); assert.ok(near(st.value, S.max - MOVEMENT.sprintStaminaPerSec, 1e-6), `sprint: ${st.value}`);
  st.heavy(); st.heavy(); st.heavy(); assert.ok(st.value > 0); assert.ok(st.heavy(), 'allowed with stamina > 0'); assert.equal(st.value, 0);
  assert.ok(st.exhausted); assert.equal(st.dodge(), false, 'refused while exhausted');
  assert.equal(st.step({ sprinting: true }), false, 'no sprint while exhausted');
  run(st, steps(S.exhaustionSec) - 2); assert.equal(st.value, 0); assert.ok(st.exhausted); st.step(); assert.ok(!st.exhausted, 'exhaustion lasts 1.2 s');
  const v0 = st.value; run(st, 60); assert.ok(near(st.value - v0, S.regenPerSec * S.exhaustedRegenScale, 1e-6), `half rate: ${st.value - v0}`);
  run(st, 60 * 20); assert.equal(st.value, S.max); assert.equal(st.state.halfRate, false);
  st.light(); run(st, steps(S.regenDelaySec) + 60); assert.ok(near(st.value, S.max - 12 + Math.min(12, S.regenPerSec), 1e-6), 'full rate again');
});

test('stamina in the sim: dodge/attacks/sprint gated, replay bit-identical', async () => {
  await initRapier();
  const rng = mulberry32(31337), log = [];
  for (let i = 0; i < 1200; i++) log.push({ mx: rng.int(-1, 1), mz: rng.int(-1, 1), dodge: rng.next() < 0.05, gait: rng.int(0, 2), light: rng.next() < 0.03, heavy: rng.next() < 0.02, fire: rng.next() < 0.01 });
  const go = (fireLit) => {
    const sc = buildScene({ seed: 3 }); sc.env.fireLit = fireLit; const vals = [];
    for (const f of log) { stepScene(sc, f, FIXED_DT); vals.push(sc.player.state.stamina.value); }
    const out = { snap: snapshot(sc), vals, actions: { ...sc.player.state.actions } }; sc.phys.free(); return out;
  };
  const a = go(false), b = go(false), c = go(true);
  assert.equal(a.snap, b.snap); assert.deepEqual(a.vals, b.vals); assert.deepEqual(a.actions, b.actions);
  assert.ok(a.actions.refused > 0, 'some actions refused for lack of stamina');
  assert.ok(Math.min(...a.vals) >= 0 && Math.max(...a.vals) <= S.max);
  assert.notDeepEqual(c.vals, a.vals, 'fire-lit regen differs');
  console.log(`# stamina sim: actions ${JSON.stringify(a.actions)}, min ${Math.min(...a.vals).toFixed(2)}`);
});
