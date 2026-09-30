// Screenshot the app at the device sizes Monster Synth is designed for.
// Usage: node scripts/shots.mjs [url] [outDir] [screen]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const url = process.argv[2] || 'http://localhost:5173/';
const outDir = process.argv[3] || 'screenshots/tmp';
const only = process.argv[4] || '';
mkdirSync(outDir, { recursive: true });

const VIEWS = [
  { name: 'phone-landscape', width: 844, height: 390, mobile: true },
  { name: 'phone-small-landscape', width: 667, height: 375, mobile: true },
  { name: 'ipad-landscape', width: 1024, height: 768, mobile: true },
  { name: 'tablet-landscape', width: 1194, height: 834, mobile: true },
  { name: 'tablet-portrait', width: 820, height: 1180, mobile: true },
  { name: 'phone-portrait', width: 390, height: 844, mobile: true },
  { name: 'desktop', width: 1440, height: 900, mobile: false },
];

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
for (const v of VIEWS) {
  if (only && !v.name.includes(only)) continue;
  const ctx = await browser.newContext({
    viewport: { width: v.width, height: v.height },
    deviceScaleFactor: 2,
    isMobile: v.mobile,
    hasTouch: v.mobile,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${outDir}/${v.name}-0-asleep.png` });
  await page.mouse.click(v.width / 2, v.height / 2);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${outDir}/${v.name}-1-lab.png` });
  if (errors.length) console.log(v.name, 'ERRORS:', errors.join('\n'));
  await ctx.close();
}
await browser.close();
console.log('done');
