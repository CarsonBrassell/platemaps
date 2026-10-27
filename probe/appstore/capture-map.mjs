import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({
  viewport: { width: 440, height: 956 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  geolocation: { latitude: 32.7490, longitude: -117.1300 }, permissions: ['geolocation'],
});
const page = await ctx.newPage();
await page.goto('https://platemaps.com/m/feed', { waitUntil: 'networkidle' });
await page.getByText('Map', { exact: true }).first().click();
await page.waitForTimeout(9000);
await page.screenshot({ path: 'probe/appstore/raw/mapview.png' });
await browser.close();
