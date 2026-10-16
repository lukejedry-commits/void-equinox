// Shared headless-Chrome helper (software GL via SwiftShader). Serves dist/ with vite preview.
// CHROME_PATH overrides the browser (default /usr/bin/google-chrome).
import { preview } from 'vite';
import puppeteer from 'puppeteer-core';

export async function withPage(fn) {
  const server = await preview({ preview: { port: 0, strictPort: false }, logLevel: 'silent' });
  const base = server.resolvedUrls.local[0];
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,720'] });
  try {
    const open = async (query, quality, settleMs = 3500) => {
      const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
      page.on('pageerror', (e) => console.error('pageerror:', e.message));
      await page.evaluateOnNewDocument((q) => localStorage.setItem('voidEquinox.quality', q), quality);
      await page.goto(`${base}?${query}`, { waitUntil: 'load' });
      await page.waitForFunction('window.__ready', { timeout: 60000 });
      await new Promise((r) => setTimeout(r, settleMs));
      return page;
    };
    return await fn(open);
  } finally { await browser.close(); await new Promise((r) => server.httpServer.close(r)); }
}
