// After `vite build --mode frappe`: turn the built index.html into the Frappe www page,
// injecting the CSRF token and boot info rendered by fluid_erp/www/fluid.py.
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
const built = '../fluid_erp/public/fluid/index.html';
let html = readFileSync(built, 'utf8');
html = html.replace('<head>', `<head>\n    <script>window.csrf_token = "{{ csrf_token }}"; window.fluid_boot = {{ boot }};</script>\n    <link rel="icon" href="/assets/fluid_erp/fluid/favicon.svg" />`);
writeFileSync('../fluid_erp/www/fluid.html', html);
rmSync(built);
console.log('wrote fluid_erp/www/fluid.html');
