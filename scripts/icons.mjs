// Render the SVG app icon to the PNG sizes browsers and iOS need.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const svg = readFileSync('public/icons/icon.svg', 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
const render = async (size, file, maskable = false) => {
  await page.setViewportSize({ width: size, height: size });
  // Maskable icons need a full-bleed background with the art inside the safe zone.
  const html = maskable
    ? `<body style="margin:0;background:linear-gradient(135deg,#4f5dff,#8a4dff 55%,#ff5fcf)"><div style="width:${size}px;height:${size}px;display:grid;place-items:center">${svg.replace('<svg ', `<svg width="${size * 0.8}" height="${size * 0.8}" `)}</div></body>`
    : `<body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`;
  await page.setContent(html);
  await page.screenshot({ path: file, omitBackground: !maskable });
};
await render(192, 'public/icons/icon-192.png');
await render(512, 'public/icons/icon-512.png');
await render(512, 'public/icons/icon-maskable-512.png', true);
await render(180, 'public/icons/apple-touch-icon.png', true);
await browser.close();
console.log('icons written');
