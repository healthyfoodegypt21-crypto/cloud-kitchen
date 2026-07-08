const { chromium } = require('@playwright/test');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:4174/login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.locator('button').nth(1).click();
  await page.goto('http://127.0.0.1:4174/orders', { waitUntil: 'networkidle', timeout: 30000 });
  console.log((await page.locator('body').innerText()).slice(0, 2500));
  await browser.close();
})();
