import { describe, expect, it } from 'vitest';
import { Frappe, FrappeError } from '../src/api/frappe';

// Checks the requests we build against Frappe's documented REST shapes (no server involved).
function stub(response: unknown, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: URL, init: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(response), { status });
  }) as unknown as typeof fetch;
  return { calls, f };
}

describe('Frappe client', () => {
  it('lists with fields and filters as JSON query params and token auth', async () => {
    const s = stub({ data: [{ name: 'PO-1' }] });
    const api = new Frappe({ baseUrl: 'https://x.frappe.cloud', apiKey: 'k', apiSecret: 's', fetch: s.f });
    const rows = await api.getList('Purchase Order', { fields: ['name'], filters: [['docstatus', '=', 1]] });
    expect(rows).toEqual([{ name: 'PO-1' }]);
    const u = new URL(s.calls[0].url);
    expect(u.pathname).toBe('/api/resource/Purchase%20Order');
    expect(JSON.parse(u.searchParams.get('filters')!)).toEqual([['docstatus', '=', 1]]);
    expect((s.calls[0].init.headers as Record<string, string>).Authorization).toBe('token k:s');
  });

  it('surfaces ERPNext validation messages', async () => {
    const msg = JSON.stringify([JSON.stringify({ message: 'Row #1: <b>Qty</b> cannot be more than ordered' })]);
    const s = stub({ exc_type: 'ValidationError', _server_messages: msg }, 417);
    const api = new Frappe({ baseUrl: 'https://x.frappe.cloud', fetch: s.f });
    await expect(api.call('frappe.client.submit', {})).rejects.toThrow(new FrappeError('Row #1: Qty cannot be more than ordered', 417, 'ValidationError'));
  });
});
