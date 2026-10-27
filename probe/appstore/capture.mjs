// Capture raw phone screens from the live site at iPhone 6.9" logical size.
import { chromium } from 'playwright';
const shots = (process.argv[2] || 'map:/m').split(',').map(s => s.split(':'));
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 440, height: 956 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  geolocation: { latitude: 32.7490, longitude: -117.1300 }, permissions: ['geolocation'],
});
for (const [name, path] of shots) {
  const page = await ctx.newPage();
  await page.goto('https://platemaps.com' + path, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `probe/appstore/raw/${name}.png` });
  console.log('saved', name, page.url());
  await page.close();
}
await browser.close();
