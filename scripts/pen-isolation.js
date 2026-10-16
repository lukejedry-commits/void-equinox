// Penetration isolation: strong push (same seeds as the suite) with/without
// dynamic boxes and with KCC impulses on/off. Reports numbers; asserts nothing.
// Usage: node scripts/pen-isolation.js [runs=1000]
import { initRapier } from '../tests/helpers.js';

import { strongPush } from '../tests/pushScenario.js';
await initRapier();
const runs = Number(process.argv[2] ?? 1000);
for (const [name, o] of [['baseline (boxes, impulses on)', {}], ['no dynamic boxes', { boxes: false }], ['boxes, setApplyImpulsesToDynamicBodies(false)', { impulses: false }], ['no boxes + impulses off', { boxes: false, impulses: false }]]) {
  const t = Date.now();
  const r = strongPush({ runs, log: false, ...o });
  console.log(`${name}: runs=${runs} tunnels=${r.tunnels} face-plane pen=${r.maxPen.toFixed(4)} static pen=${r.pa.stat.toFixed(4)} (${r.pa.statAt}) dynamic pen=${r.pa.dyn.toFixed(4)} ${Date.now() - t}ms`);
}
