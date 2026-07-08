const { chromium } = require('@playwright/test');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:4174/login', { waitUntil: 'networkidle', timeout: 30000 });
  console.log(await page.locator('body').innerText());
  await browser.close();
})();
