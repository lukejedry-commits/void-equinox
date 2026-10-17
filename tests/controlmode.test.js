import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultControlMode, stickAccepts, usesTouchUI } from '../src/ui/controlmode.js';

test('control mode: touchscreen + mouse defaults to PC; stick only for touch pointers in Phone/Tablet', () => {
  assert.equal(defaultControlMode({ anyFine: true, touch: true, minSidePx: 800 }), 'pc');
  assert.equal(defaultControlMode({ anyFine: true, touch: false, minSidePx: 800 }), 'pc');
  assert.equal(defaultControlMode({ anyFine: false, touch: true, minSidePx: 390 }), 'phone');
  assert.equal(defaultControlMode({ anyFine: false, touch: true, minSidePx: 820 }), 'tablet');
  for (const m of ['phone', 'tablet']) {
    assert.ok(usesTouchUI(m)); assert.ok(stickAccepts(m, 'touch'));
    assert.ok(!stickAccepts(m, 'mouse')); assert.ok(!stickAccepts(m, 'pen'));
  }
  assert.ok(!usesTouchUI('pc')); assert.ok(!stickAccepts('pc', 'touch'));
});
