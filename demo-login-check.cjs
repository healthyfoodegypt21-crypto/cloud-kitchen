const { chromium } = require('@playwright/test');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const messages = [];
  page.on('console', msg => messages.push(`console:${msg.type()}:${msg.text()}`));
  page.on('pageerror', err => messages.push(`pageerror:${err.message}`));
  await page.goto('http://127.0.0.1:4174/login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.locator('button').filter({ hasText: '???? ?????? ????' }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'playwright-artifacts/demo-login-check.png', fullPage: true });
  console.log('URL=' + page.url());
  console.log('BODY=' + (await page.locator('body').innerText()).slice(0, 1200));
  console.log('MESSAGES_START');
  for (const message of messages) console.log(message);
  console.log('MESSAGES_END');
  await browser.close();
})();
