const { chromium } = require('@playwright/test');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const messages = [];
  page.on('console', msg => messages.push(`console:${msg.type()}:${msg.text()}`));
  page.on('pageerror', err => messages.push(`pageerror:${err.message}`));
  await page.goto('http://127.0.0.1:4174/login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.locator('button').nth(1).click();
  await page.waitForTimeout(2500);
  const text = await page.locator('body').innerText();
  console.log('URL=' + page.url());
  console.log('HAS_APP=' + String(text.includes('????? ????? ????') || text.includes('???????') || text.includes('???? ??????')));
  console.log('BODY_HEAD=' + text.slice(0, 700));
  console.log('MESSAGES_START');
  for (const message of messages) console.log(message);
  console.log('MESSAGES_END');
  await browser.close();
})();
