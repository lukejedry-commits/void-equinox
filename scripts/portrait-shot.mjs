// Portrait screenshot (390x844 @2x, iPhone-class). Usage: npm run build && node scripts/portrait-shot.mjs [out] [query]
import { withPage } from './headless.mjs';
const out = process.argv[2] || 'docs/screenshot_portrait.png', query = process.argv[3] || 'behind&act=act1';
await withPage(async (open) => {
  const page = await open(query, 'medium', 500);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: out.includes('touch') });
  await new Promise((r) => setTimeout(r, 5000)); // let the framing blend settle
  await page.addStyleTag({ content: '#perf,#hint{display:none!important}' });
  console.log(await page.evaluate(() => JSON.stringify(window.__tps.framing)));
  await page.screenshot({ path: out });
});
