import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FOV_MIN, FOV_MAX, clampFov, verticalFov } from '../src/render/camera.js';

test('FOV slider 60-80 vertical (FOV_MAX constant); portrait 65 deg horizontal floor still applies', () => {
  assert.equal(FOV_MIN, 60); assert.equal(FOV_MAX, 80);
  assert.equal(clampFov(50), 60); assert.equal(clampFov(95), FOV_MAX); assert.equal(clampFov(72), 72);
  assert.equal(verticalFov(16 / 9, 72), 72);
  assert.equal(verticalFov(16 / 9, 120), FOV_MAX);
  const a = 390 / 844, floor = 2 * Math.atan(Math.tan(32.5 * Math.PI / 180) / a) * 180 / Math.PI;
  assert.ok(Math.abs(verticalFov(a, 60) - floor) < 1e-9, 'portrait floor wins over the slider');
  const h = (v, asp) => 2 * Math.atan(Math.tan(v * Math.PI / 360) * asp) * 180 / Math.PI;
  for (const asp of [0.46, 0.6, 0.75, 0.99]) for (const v of [60, 70, 80]) assert.ok(h(verticalFov(asp, v), asp) >= 65 - 1e-9);
  assert.ok(verticalFov(0.99, 80) >= 80, 'slider wins when wider than the floor');
});
