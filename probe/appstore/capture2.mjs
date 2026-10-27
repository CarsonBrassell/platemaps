import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({
  viewport: { width: 440, height: 956 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  geolocation: { latitude: 32.7490, longitude: -117.1300 }, permissions: ['geolocation'],
});
const page = await ctx.newPage();
await page.goto('https://platemaps.com/m/feed', { waitUntil: 'networkidle' });
const links = await page.$$eval('a[href*="/restaurant/"]', as => [...new Set(as.map(a => a.getAttribute('href')))]);
console.log(links.slice(0, 10));
// second feed card
await page.mouse.wheel(0, 900); await page.waitForTimeout(2500);
await page.screenshot({ path: 'probe/appstore/raw/feed2.png' });
// map, panned so bubbles sit fully on screen
await page.goto('https://platemaps.com/m/feed', { waitUntil: 'networkidle' });
await page.getByText('Map', { exact: true }).first().click();
await page.waitForTimeout(7000);
await page.mouse.move(220, 600); await page.mouse.down(); await page.mouse.move(330, 640, { steps: 15 }); await page.mouse.up();
await page.waitForTimeout(5000);
await page.screenshot({ path: 'probe/appstore/raw/mapview2.png' });
for (const [i, href] of links.slice(0, 3).entries()) {
  await page.goto('https://platemaps.com' + href, { waitUntil: 'networkidle' }); await page.waitForTimeout(3000);
  await page.screenshot({ path: `probe/appstore/raw/rest${i}.png` }); console.log('rest' + i, page.url());
}
await browser.close();
