import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampBrightness, brightnessScale, BRIGHTNESS_STOPS, PRESENCE } from '../src/render/lighting.js';
import { displayValue, REF } from '../src/ui/brightness.js';

test('brightness: +-0.25 stop pre-tonemap exposure; presence relative lift kept; reference symbol barely visible', () => {
  assert.equal(BRIGHTNESS_STOPS, 0.25);
  assert.equal(clampBrightness(1), 0.25); assert.equal(clampBrightness(-1), -0.25);
  assert.ok(Math.abs(brightnessScale(0.25) - 2 ** 0.25) < 1e-12 && Math.abs(brightnessScale(-0.25) - 2 ** -0.25) < 1e-12);
  for (const b of [-0.25, 0, 0.25]) { // exposure x scale for both normal and presence -> same ratio
    const normal = 1 * brightnessScale(b), pres = PRESENCE.exposure * brightnessScale(b);
    assert.ok(Math.abs(pres / normal - PRESENCE.exposure) < 1e-12);
  }
  const panel = displayValue(REF.panel, 1), sym = displayValue(REF.symbol, 1);
  assert.ok(sym - panel >= 1 && sym - panel <= 12, `barely visible at default: ${panel} vs ${sym}`);
  assert.ok(displayValue(REF.symbol, brightnessScale(0.25)) > sym && displayValue(REF.symbol, brightnessScale(-0.25)) < sym);
});
