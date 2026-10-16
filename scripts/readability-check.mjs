// Readability check: renders each act headless on Low and High and measures the tell-flare
// patch luminance vs scene mean (must be >= 2.5x), decay edge contrast and fire radius.
// Usage: npm run build && npm run check:readability   (exit 1 on any ratio < 2.5)
import { withPage } from './headless.mjs';

const MIN = 2.5;
let fail = false;
await withPage(async (open) => {
  for (const q of ['low', 'high']) {
    const page = await open('shot', q);
    for (const unblockable of [false, true]) {
      const res = await page.evaluate((u) => window.__readability({ presence: ['act2'], unblockable: u }), unblockable);
      console.log(`\n[${q}] ${unblockable ? 'unblockable' : 'normal'} tell`);
      console.log('profile          presence  mean    tell    ratio   decayEdge  fireIn/Out');
      for (const r of res) {
        if (r.ratio < MIN) fail = true;
        console.log(`${r.profile.padEnd(16)} ${String(r.presence).padEnd(9)} ${String(r.meanLum).padEnd(7)} ${String(r.tellLum).padEnd(7)} ${String(r.ratio).padEnd(7)} ${String(r.decayEdgeContrast).padEnd(10)} ${r.fireRadiusRatio}${r.ratio < MIN ? '  FAIL' : ''}`);
      }
    }
    await page.close();
  }
});
console.log(fail ? '\nREADABILITY FAIL' : '\nREADABILITY OK (all tell ratios >= 2.5)');
process.exit(fail ? 1 : 0);
