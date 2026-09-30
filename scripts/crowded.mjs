import { chromium } from 'playwright';
const url = process.argv[2] || 'http://127.0.0.1:5173/';
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
for (const [name, width, height] of [['phone', 844, 390], ['small', 667, 375], ['ipad', 1024, 768]]) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__monster?.getState().ready);
  await page.mouse.click(width / 2, height / 2);
  await page.evaluate(async () => {
    const m = window.__monster;
    await m.actions.newSong('band');
    m.actions.updateSettings({ ageMode: 'maker' });
  });
  await page.locator('.add-seat').click();
  await page.locator('.tray-card[data-monster="puff"]').click();
  await page.locator('.tray-card[data-monster="mimic"]').click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `screenshots/tmp/crowded-${name}.png` });
  await page.locator('.pod[data-monster="boom"] .pod-hit').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `screenshots/tmp/crowded-${name}-drums.png` });
  await page.close();
}
await browser.close();
