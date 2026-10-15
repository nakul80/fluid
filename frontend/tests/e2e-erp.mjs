// Smoke test of ERPNext mode against a stubbed Frappe API: checks screens render and the requests
// we send have the right shape. It does not prove behaviour against a real ERPNext site.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join } from 'node:path';

const dist = join(process.cwd(), 'dist');
const sent = [];
const reports = [];
const po = { name: 'PUR-ORD-0001', doctype: 'Purchase Order', docstatus: 1, status: 'To Receive and Bill', supplier: 'Raj Electric', transaction_date: '2026-10-10', per_received: 0, per_billed: 0, grand_total: 61000,
  items: [{ item_code: 'FAN', item_name: 'Ceiling Fan', qty: 30, rate: 1440, amount: 43200, uom: 'Nos' }] };
const data = {
  Company: [{ name: 'Test Co' }], Supplier: [{ name: 'Raj Electric', supplier_name: 'Raj Electric' }], Customer: [{ name: 'Mehta', customer_name: 'Mehta Constructions' }],
  Item: [{ name: 'FAN', item_name: 'Ceiling Fan', stock_uom: 'Nos', standard_rate: 2100, valuation_rate: 1450 }, { name: 'MCB', item_name: 'MCB 32A', stock_uom: 'Nos', standard_rate: 260, valuation_rate: 180 }],
  Warehouse: [{ name: 'Stores - TC' }], Bin: [{ item_code: 'FAN', actual_qty: 40, ordered_qty: 30, reserved_qty: 0 }],
  'Purchase Order': [{ name: 'PUR-ORD-0001', party: 'Raj Electric', date: '2026-10-10', total: 61000, status: 'To Receive and Bill', docstatus: 1, supplier: 'Raj Electric', transaction_date: '2026-10-10', grand_total: 61000, per_received: 0 }],
};
const json = (res, body, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  let body = '';
  for await (const c of req) body += c;
  if (url.pathname.startsWith('/api/')) {
    sent.push({ method: req.method, path: decodeURIComponent(url.pathname), query: Object.fromEntries(url.searchParams), body: body ? JSON.parse(body) : undefined, csrf: req.headers['x-frappe-csrf-token'] });
    const m = url.pathname.match(/^\/api\/resource\/([^/]+)(?:\/(.+))?$/);
    if (m) {
      const dt = decodeURIComponent(m[1]);
      if (m[2]) return json(res, { data: dt === 'Stock Settings' ? { default_warehouse: 'Stores - TC' } : po });
      return json(res, { data: data[dt] ?? [] });
    }
    const method = url.pathname.replace('/api/method/', '');
    const args = body ? JSON.parse(body) : {};
    if (method.endsWith('make_purchase_receipt')) return json(res, { message: { doctype: 'Purchase Receipt', supplier: 'Raj Electric', items: [{ item_code: 'FAN', qty: 30, rate: 1440, purchase_order: 'PUR-ORD-0001', uom: 'Nos' }] } });
    if (method === 'frappe.desk.query_report.run') {
      reports.push(args);
      if (args.report_name === 'General Ledger') return json(res, { message: { columns: [{ fieldname: 'posting_date', label: 'Posting Date', fieldtype: 'Date' }, { fieldname: 'debit', label: 'Debit', fieldtype: 'Currency' }, { fieldname: 'credit', label: 'Credit', fieldtype: 'Currency' }, { fieldname: 'voucher_type', label: 'Voucher Type', fieldtype: 'Data' }, { fieldname: 'voucher_no', label: 'Voucher No', fieldtype: 'Dynamic Link' }],
        result: [{ posting_date: '2026-10-10', debit: 0, credit: 61000, voucher_type: 'Purchase Order', voucher_no: 'PUR-ORD-0001' }] } });
      return json(res, { message: { columns: [{ fieldname: 'account', label: 'Account', fieldtype: 'Link' }, { fieldname: 'debit', label: 'Debit', fieldtype: 'Currency' }, { fieldname: 'credit', label: 'Credit', fieldtype: 'Currency' }],
        result: [{ account: 'Current Assets - TC', account_name: 'Current Assets', indent: 0, debit: 500 }, { account: 'Cash - TC', account_name: 'Cash', indent: 1, debit: 500 }, {}, { account: "'Total'", indent: 0, debit: 500, credit: 500 }] } });
    }
    if (method === 'frappe.client.insert') return json(res, { message: { ...args.doc, name: args.doc.doctype === 'Purchase Order' ? 'PUR-ORD-0002' : 'MAT-PRE-0001', docstatus: 0 } });
    if (method === 'frappe.client.submit') return json(res, { message: { ...args.doc, docstatus: 1 } });
    return json(res, { message: null });
  }
  const file = join(dist, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!existsSync(file)) return json(res, {}, 404);
  res.writeHead(200, { 'Content-Type': { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' }[extname(file)] ?? 'text/plain' });
  res.end(readFileSync(file));
}).listen(4173);

const out = process.argv[2];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => { window.csrf_token = 'tok123'; window.fluid_boot = { user: 'test@example.com', default_company: 'Test Co' }; });
await page.goto('http://localhost:4173/');
const k = (s) => page.keyboard.press(s);
const wait = (ms = 250) => page.waitForTimeout(ms);
const h1 = () => page.locator('h1').first().innerText();
await wait(500); await page.screenshot({ path: `${out}/erp-01-home.png` });
console.log('home:', await h1(), '| company:', await page.locator('.company').innerText());
await k('u'); await wait(); console.log('cycle:', await h1(), '| cards:', await page.locator('.kcard').count());
await page.screenshot({ path: `${out}/erp-02-cycle.png` });
await k('Enter'); await wait(); console.log('doc:', (await h1()).replace(/\n/g, ' '));
await k('r'); await wait(); console.log('R ->', (await h1()).replace(/\n/g, ' '), '| lines:', await page.locator('table.lines tbody tr').count());
await page.screenshot({ path: `${out}/erp-03-receipt.png` });
await k('Control+Enter'); await wait(); console.log('after save:', (await h1()).replace(/\n/g, ' '), '|', await page.locator('.toast').innerText().catch(() => ''));
// New PO by keyboard
await k('Shift+F9'); await wait();
await page.keyboard.type('raj'); await k('Enter'); await k('Enter'); await k('Enter');
console.log('focus before item:', await page.evaluate(() => document.activeElement?.placeholder + '/' + document.activeElement?.value)); await page.keyboard.type('mcb'); await k('Enter'); await wait(); console.log('focus after item:', await page.evaluate(() => document.activeElement?.className + '/' + document.activeElement?.value), await page.locator('table.lines tbody tr').count()); await page.keyboard.type('50'); await k('Enter'); await k('Enter'); await wait(); await page.screenshot({ path: process.argv[2] + '/erp-04-po.png' });
await k('Control+Enter'); await wait();
console.log('PO save:', (await h1()).replace(/\n/g, ' '), '| errors box:', await page.locator('.errors').innerText().catch(() => 'none'));
const ins = sent.filter((s) => s.path.endsWith('frappe.client.insert'));
console.log('insert payloads:', JSON.stringify(ins.map((s) => s.body.doc)));
console.log('csrf on POSTs:', sent.filter((s) => s.method === 'POST').every((s) => s.csrf === 'tok123'));
await k('Escape'); await k('Escape'); await k('Escape'); await k('Escape'); await k('Escape'); await wait();
await k('g'); await k('t'); await wait(500); console.log('TB:', await h1(), '| rows:', await page.locator('table.report tbody tr').count());
await page.screenshot({ path: `${out}/erp-05-tb.png` });
await k('ArrowDown'); await k('Enter'); await wait(500); console.log('drill ->', await h1(), '| filters:', JSON.stringify(reports.at(-1).filters));
await k('Enter'); await wait(500); console.log('drill2 ->', (await h1()).replace(/\n/g, ' '));
console.log('TB filters:', JSON.stringify(reports[0]));
console.log('ERRORS:', errors);
await browser.close(); server.close();
