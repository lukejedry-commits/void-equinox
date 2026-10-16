// Per-system draw-call breakdown on a given quality tier (default medium), per act.
// Usage: npm run build && node scripts/drawcall-breakdown.mjs [medium]
import { writeFileSync } from 'node:fs';
import { withPage } from './headless.mjs';
const q = process.argv[2] || 'medium';
const RUNS = [['act1'], ['act1_arena'], ['act2'], ['act2_boss'], ['act3'], ['act2', true]];
const out = [];
await withPage(async (open) => {
  for (const [act, pres] of RUNS) {
    const page = await open(`shot&act=${act}${pres ? '&presence=1' : ''}`, q, 4000);
    const r = await page.evaluate(() => window.__drawBreakdown());
    out.push({ act, presence: !!pres, quality: q, ...r });
    console.log(`\n${act}${pres ? ' +presence' : ''} [${q}] total ${r.total} (sum ${r.sum})`);
    for (const [k, v] of Object.entries(r.systems).sort()) console.log(`  ${String(v).padStart(3)}  ${k}`);
    await page.close();
  }
});
writeFileSync(`docs/lighting/drawcalls_${q}.json`, JSON.stringify(out, null, 2) + '\n');
