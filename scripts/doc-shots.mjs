// Curated screenshots for the README/docs (JPEG, modest size).
import { chromium } from 'playwright';
const url = process.argv[2] || 'http://127.0.0.1:5173/';
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const shoot = async (page, name) => page.screenshot({ path: `docs/images/${name}.jpg`, type: 'jpeg', quality: 84 });

async function open(width, height) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1.5 });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__monster?.getState().ready);
  await page.evaluate(() => window.__monster.actions.updateSettings({ hints: false }));
  return page;
}

// Phone: wake screen, then the band playing in the Lab
{
  const page = await open(844, 390);
  await shoot(page, 'phone-wake');
  await page.mouse.click(422, 195);
  await page.evaluate(async () => window.__monster.actions.newSong('band'));
  await page.waitForTimeout(300);
  await page.locator('.t-play').click();
  await page.waitForTimeout(1350);
  await shoot(page, 'phone-lab');
  await page.locator('.t-play').click();
  // Paint
  await page.locator('.dock-btn[data-screen="paint"]').click();
  await page.waitForTimeout(300);
  const c = await page.locator('.paint-canvas').boundingBox();
  const draw = async (pts) => {
    await page.mouse.move(c.x + pts[0][0] * c.width, c.y + pts[0][1] * c.height);
    await page.mouse.down();
    for (const [x, y] of pts.slice(1)) await page.mouse.move(c.x + x * c.width, c.y + y * c.height, { steps: 6 });
    await page.mouse.up();
  };
  await page.locator('.swatch[data-brush="rainbow"]').click();
  await draw(Array.from({ length: 24 }, (_, i) => [0.05 + i * 0.038, 0.45 - 0.3 * Math.sin(i / 3.2)]));
  await page.locator('.swatch[data-brush="grumble"]').click();
  await draw([[0.06, 0.88], [0.3, 0.88]]);
  await draw([[0.52, 0.8], [0.8, 0.8]]);
  await page.locator('.paint-tool').nth(1).click();
  await page.locator('.swatch[data-brush="spark"]').click();
  await draw([[0.62, 0.22], [0.72, 0.14], [0.82, 0.24], [0.92, 0.12]]);
  await page.waitForTimeout(200);
  await page.locator('.t-play').click();
  await page.waitForTimeout(1600);
  await shoot(page, 'phone-paint');
  await page.close();
}

// Tablet: Lab, Blocks, Songs, Parent Space
{
  const page = await open(1180, 820);
  await page.mouse.click(590, 410);
  await page.evaluate(async () => window.__monster.actions.newSong('band'));
  await page.waitForTimeout(300);
  await page.locator('.t-play').click();
  await page.waitForTimeout(1250);
  await shoot(page, 'tablet-lab');
  await page.locator('.t-play').click();
  await page.locator('.dock-btn[data-screen="blocks"]').click();
  await page.waitForTimeout(200);
  await page.locator('.t-play').click();
  await page.waitForTimeout(6300);
  await shoot(page, 'tablet-blocks');
  await page.locator('.t-play').click();
  await page.locator('.dock-btn[data-screen="songs"]').click();
  await page.waitForTimeout(400);
  await shoot(page, 'tablet-songs');
  await page.evaluate(() => window.__monster.actions.setOverlay('parent'));
  await page.waitForTimeout(300);
  await shoot(page, 'tablet-parent');
  await page.close();
}
await browser.close();
console.log('doc shots done');
