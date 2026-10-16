import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defineTrack, sampleTrack, createTrackPlayer, LIGHT_SLASH } from '../src/combat/hitboxTrack.js';

test('hitbox track: sampling is integer-step indexed and step-held', () => {
  const t = LIGHT_SLASH;
  const act = [];
  for (let s = 0; s < t.lengthSteps; s++) act.push(sampleTrack(t, s).active ? 1 : 0);
  assert.equal(act.join(''), '000000001111110000000000');
  assert.equal(sampleTrack(t, 9).stepIndex, 8);
  assert.equal(sampleTrack(t, 11).shape.type, 'capsule');
  assert.equal(sampleTrack(t, -1).active, false);
  assert.equal(sampleTrack(t, 24).active, false);
  assert.throws(() => sampleTrack(t, 8.5));
  assert.throws(() => defineTrack({ lengthSteps: 4, keys: [{ stepIndex: 1.5, shape: {}, active: true }] }));
});

test('hitbox track: deterministic, independent of render rate / call history', () => {
  const run = () => { const p = createTrackPlayer(LIGHT_SLASH); p.start(); const out = []; for (let i = 0; i < 30; i++) out.push(JSON.stringify(p.tick())); return out; };
  const a = run(), b = run();
  assert.deepEqual(a, b);
  // Random-order direct sampling equals sequential playback.
  for (const s of [17, 3, 11, 8, 0, 23, 13]) assert.equal(JSON.stringify(sampleTrack(LIGHT_SLASH, s)), a[s]);
  assert.equal(JSON.parse(a[24]).active, false); // finished
});
