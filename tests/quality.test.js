import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createQuality, AUTO } from '../src/render/quality.js';

const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
test('auto quality: one tier down after 2 s averaging > 20 ms; never back up', () => {
  const seen = []; const q = createQuality({ storage: mem(), onChange: (_, t) => seen.push(t) }); q.init();
  assert.equal(q.tier, 'high');
  const feed = (ms, sec) => { for (let t = 0; t < sec; t += ms / 1000) q.frame(ms / 1000); };
  feed(19.9, 4); assert.equal(q.tier, 'high', '<= 20 ms stays');
  feed(25, 1.5); assert.equal(q.tier, 'high', 'not before 2 s');
  feed(25, 1); assert.equal(q.tier, 'medium', 'one step down');
  feed(25, AUTO.windowSec + 0.1); assert.equal(q.tier, 'low');
  feed(5, 30); assert.equal(q.tier, 'low', 'never steps back up');
  assert.deepEqual(seen, ['high', 'medium', 'low']);
  const q2 = createQuality({ storage: mem() }); q2.init(); feed.call(null, 0, 0);
  for (let i = 0; i < 300; i++) q2.frame(1 / 60); assert.equal(q2.tier, 'high', 'fast device stays high');
  const st = mem(); st.setItem('voidEquinox.quality', 'medium'); const q3 = createQuality({ storage: st }); q3.init();
  for (let i = 0; i < 300; i++) q3.frame(0.05); assert.equal(q3.tier, 'medium', 'manual override never auto-steps');
});
