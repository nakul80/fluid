import { chromium } from 'playwright';
const out = process.argv[2];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto('file://' + process.cwd() + '/dist-single/index.html');
const k = (s) => page.keyboard.press(s);
const type = (s) => page.keyboard.type(s, { delay: 10 });
const wait = (ms = 120) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
const title = () => page.locator('h1').first().innerText();
const toast = async () => (await page.locator('.toast').count()) ? page.locator('.toast').innerText() : '';
const errs = async () => (await page.locator('.errors').count()) ? page.locator('.errors').innerText() : '';

await wait(300); await shot('01-dashboard');
await k('u'); await wait(); console.log('U ->', await title()); await shot('02-purchase-cycle');

// PO-0003 -> receive -> bill -> pay
await k('Control+k'); await type('PO-0003'); await k('Enter'); await wait();
console.log('opened', await title());
await k('r'); await wait(); console.log('R ->', await title());
await k('Control+Enter'); await wait(); console.log('save GRN', await toast(), await errs(), '|', await title());
await k('b'); await wait(); console.log('B ->', await title());
await k('Control+Enter'); await wait(); console.log('save bill', await toast(), await errs(), '|', await title());
await shot('03-bill-with-chain');
await k('p'); await wait(); console.log('P ->', await title());
await k('Control+Enter'); await wait(); console.log('save pay', await toast(), await errs(), '|', await title());
console.log('chain:', (await page.locator('ol.chain li').allInnerTexts()).map((s) => s.replace(/\s+/g, ' ')).join(' || '));
await shot('04-payment');

// F8 invoice for Sharma by keyboard, pulling pending lines
await k('F8'); await wait(); console.log('F8 ->', await title());
await type('sharma'); await k('Enter'); await wait();
console.log('focused after party:', await page.evaluate(() => document.activeElement?.className + ' ' + document.activeElement?.value));
console.log('pending btn:', await page.locator('.pending').innerText().catch(() => 'none'));
await k('Alt+l'); await wait();
console.log('lines:', await page.locator('table.lines tbody tr').count());
await shot('05-invoice-pulled');
await k('Control+Enter'); await wait(); console.log('save inv', await toast(), await errs(), '|', await title());

// F9 bill typed manually
await k('F9'); await wait();
await type('prak'); await k('Enter'); await k('Enter'); await wait();
console.log('focus at:', await page.evaluate(() => document.activeElement?.placeholder));
await type('mcb'); await k('Enter'); await wait();
await type('10'); await k('Enter'); await type('175'); await k('Enter'); await wait();
console.log('focus at:', await page.evaluate(() => document.activeElement?.placeholder));
await type('tube'); await k('Enter'); await type('5'); await k('Enter'); await k('Enter'); await wait();
await k('Enter'); await wait();
console.log('focus at:', await page.evaluate(() => document.activeElement?.tagName));
await type('typed fully by keyboard');
await shot('06-bill-typed');
await k('Control+Enter'); await wait(); console.log('save bill2', await toast(), await errs());

// F7 journal with auto-balancing
await k('Escape'); await wait();
await k('F7'); await wait(); await k('Enter');
await type('rent'); await k('Enter'); console.log('jv ledger 1:', await page.locator('table.lines tbody tr').first().locator('input').first().inputValue()); await type('1000'); await k('Enter'); await k('Enter');
await type('cash'); await k('Enter'); await wait();
console.log('auto cr:', await page.locator('table.lines tbody tr').nth(1).locator('input').nth(2).inputValue());
await k('Enter'); await k('Enter'); await k('Enter'); await wait();
console.log('focus at:', await page.evaluate(() => document.activeElement?.tagName));
await k('Control+Enter'); await wait(); console.log('save jv', await toast(), await errs());
await k('Escape'); await wait();

// Over-receipt is blocked
await k('Control+k'); await type('PO-0002'); await k('Enter'); await wait();
await k('r'); await wait();
await page.locator('table.lines tbody tr').first().locator('input').nth(1).fill('999');
await k('Control+Enter'); await wait(); console.log('over-receive errors:', await errs());
await k('Escape'); await wait(); console.log('confirm modal:', await page.locator('.modal').count()); await k('y'); await wait();

// Reports
await k('g'); await k('t'); await wait(); console.log('GT ->', await title(), await page.locator('.totals-bar').innerText()); await shot('07-tb');
await k('g'); await k('b'); await wait(); console.log('GB ->', await title(), await page.locator('.totals-bar').innerText()); await shot('08-bs');
await k('g'); await k('p'); await wait(); await shot('09-pl');
await k('g'); await k('r'); await wait(); await shot('10-receivables');
await k('g'); await k('k'); await wait(); await shot('11-stock');
await k('g'); await k('s'); await wait(); await shot('12-sales-cycle');
await k('g'); await k('d'); await wait(); await shot('13-daybook');
// Drill: TB -> ledger -> voucher
await k('g'); await k('t'); await wait();
for (let i = 0; i < 6; i++) await k('ArrowDown');
await k('Enter'); await wait(); console.log('drill ->', await title());
await k('Enter'); await wait(); console.log('drill2 ->', await title());
await k('Escape'); await k('Escape'); await wait(); console.log('back ->', await title());

await page.setViewportSize({ width: 390, height: 844 });
await k('g'); await k('h'); await wait(); await shot('14-mobile');
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
console.log('mobile h-overflow:', overflow);
console.log('ERRORS:', errors);
await browser.close();
