// Settings panel (quality, controls, FOV, brightness + 'barely visible' reference) screenshot.
// Usage: npm run build && node scripts/settings-shot.mjs [out]
import { withPage } from './headless.mjs';
const out = process.argv[2] || 'docs/brightness_reference.png';
await withPage(async (open) => {
  const page = await open('act=act1', 'medium', 2000, { width: 1280, height: 720, deviceScaleFactor: 3 });
  const el = await page.$('#settings'); await el.screenshot({ path: out });
});
