// Lighting screenshots (headless Chrome, software GL). Writes docs/lighting/*.png,
// docs/screenshot_tps.png and docs/lighting/report.json (draw calls + readability ratios).
// Usage: npm run build && npm run shots:lighting
import { mkdirSync, writeFileSync } from 'node:fs';
import { withPage } from './headless.mjs';

const SHOTS = [
  ['act1_low', 'act1', 'low'], ['act1_high', 'act1', 'high'], ['act1_arena_high', 'act1_arena', 'high'],
  ['act2_low', 'act2', 'low'], ['act2_high', 'act2', 'high'], ['act2_presence_low', 'act2', 'low', true], ['act2_presence_medium', 'act2', 'medium', true], ['act2_presence_high', 'act2', 'high', true],
  ['act3_low', 'act3', 'low'], ['act3_high', 'act3', 'high'],
];
mkdirSync('docs/lighting', { recursive: true });
const report = [];
await withPage(async (open) => {
  const shoot = async (name, query, q, profile, presence, path) => {
    const page = await open(query, q, 5000);
    await page.addStyleTag({ content: '#perf,#hint,#settings{display:none!important}' });
    const [r] = await page.evaluate((p, pr) => window.__readability({ profiles: pr ? [] : [p], presence: pr ? [p] : [] }), profile, !!presence);
    await new Promise((res) => setTimeout(res, 800));
    const drawCalls = await page.evaluate('window.__drawCalls');
    await page.screenshot({ path });
    report.push({ shot: path, profile, quality: q, presence: !!presence, drawCalls, meanLum: r.meanLum, tellLum: r.tellLum, ratio: r.ratio,
      decayEdgeContrast: r.decayEdgeContrast, fireRadiusRatio: r.fireRadiusRatio });
    console.log(`${path.padEnd(38)} draws ${drawCalls}  tell/mean ${r.ratio}  decayEdge ${r.decayEdgeContrast}  fireIn/Out ${r.fireRadiusRatio}`);
    await page.close();
  };
  for (const [name, profile, q, pres] of SHOTS)
    await shoot(name, `shot&act=${profile}${pres ? '&presence=1' : ''}`, q, profile, pres, `docs/lighting/${name}.png`);
  await shoot('tps', 'behind&act=act1', 'high', 'act1', false, 'docs/screenshot_tps.png');
});
writeFileSync('docs/lighting/report.json', JSON.stringify(report, null, 2) + '\n');
