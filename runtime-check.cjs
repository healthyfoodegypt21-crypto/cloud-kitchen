const { chromium } = require('@playwright/test');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const messages = [];
  page.on('console', msg => messages.push(`console:${msg.type()}:${msg.text()}`));
  page.on('pageerror', err => messages.push(`pageerror:${err.message}`));
  try {
    await page.goto('http://127.0.0.1:4174/', { waitUntil: 'networkidle', timeout: 30000 });
    await page.screenshot({ path: 'playwright-artifacts/runtime-check.png', fullPage: true });
    const title = await page.title();
    const bodyText = await page.locator('body').innerText();
    console.log('TITLE=' + title);
    console.log('URL=' + page.url());
    console.log('BODY=' + bodyText.slice(0, 1200));
    console.log('MESSAGES_START');
    for (const message of messages) console.log(message);
    console.log('MESSAGES_END');
  } finally {
    await browser.close();
  }
})();
