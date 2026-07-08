const { chromium } = require('@playwright/test');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:4174/login', { waitUntil: 'networkidle', timeout: 30000 });
  const buttons = page.locator('button');
  const count = await buttons.count();
  console.log('BUTTONS=' + count);
  for (let i = 0; i < count; i++) {
    console.log('BUTTON_' + i + '=' + await buttons.nth(i).innerText());
  }
  await browser.close();
})();
