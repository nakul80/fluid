const inr = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inr0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const qtyFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 });
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const money = (n: number) => inr.format(Math.abs(n) < 0.005 ? 0 : n);
export const money0 = (n: number) => '₹' + inr0.format(n);
export const qty = (n: number) => qtyFmt.format(n);

/** Tally-style Dr/Cr display; Dr positive. */
export const drcr = (n: number) => (Math.abs(n) < 0.005 ? '0.00' : `${inr.format(Math.abs(n))} ${n > 0 ? 'Dr' : 'Cr'}`);

/** Compact lakh/crore figure for tiles: 12.4 L, 1.2 Cr. */
export function compact(n: number) {
  const a = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(2)} L`;
  return `${sign}₹${inr0.format(a)}`;
}

export function fmtDate(iso?: string) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return `${String(d).padStart(2, '0')}-${MONTHS[m - 1]}-${y}`;
}

export function todayISO() {
  const d = new Date();
  return toISO(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

const toISO = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

export function addDays(iso: string, days: number) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Fast date entry like Tally: "15" → 15th of the base month, "15-10" or "15/10" → 15 Oct,
 * "15-10-26" / "15.10.2026" → full date, "15 oct" works too, "t" = today, "+3"/"-2" days from base.
 */
export function parseDate(input: string, base: string): string | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return valid(s);
  if (s === 't' || s === 'today') return todayISO();
  if (/^[+-]\d+$/.test(s)) return addDays(base, Number(s));
  const [by, bm] = base.split('-').map(Number);
  const parts = s.split(/[\s\-/.]+/).filter(Boolean);
  if (!parts.length || parts.length > 3) return null;
  const d = Number(parts[0]);
  let m = bm;
  let y = by;
  if (parts[1]) {
    const mi = MONTHS.findIndex((x) => parts[1].startsWith(x.toLowerCase()));
    m = mi >= 0 ? mi + 1 : Number(parts[1]);
  }
  if (parts[2]) {
    y = Number(parts[2]);
    if (y < 100) y += 2000;
  }
  if (!d || !m || !y) return null;
  return valid(toISO(y, m, d));
}

function valid(iso: string) {
  const d = new Date(iso + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
}

export function parseNum(s: string): number {
  const n = Number(String(s).replace(/,/g, '').trim());
  return isFinite(n) ? n : 0;
}
