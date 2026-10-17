// Portrait screenshot (390x844 @2x, iPhone-class); an output name containing 'touch' emulates touch. Usage: npm run build && node scripts/portrait-shot.mjs [out] [query]
import { withPage } from './headless.mjs';
const out = process.argv[2] || 'docs/screenshot_portrait.png', query = process.argv[3] || ('behind&act=act1' + (out.includes('touch') ? '&controls=phone' : ''));
await withPage(async (open) => {
  // touch=true emulates a touch device from page load (touch UI only appears on touch devices)
  const page = await open(query, 'medium', 5000, { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: out.includes('touch') });
  await page.addStyleTag({ content: '#perf,#hint{display:none!important}' });
  console.log(await page.evaluate(() => JSON.stringify(window.__tps.framing)));
  await page.screenshot({ path: out });
});
