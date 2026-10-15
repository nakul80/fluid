/**
 * Minimal Frappe REST client. In the browser it relies on the session cookie (same-origin app,
 * or a CORS-enabled site after /api/method/login). For scripts and tests, pass an API key/secret.
 */
export interface FrappeOptions { baseUrl: string; apiKey?: string; apiSecret?: string; fetch?: typeof fetch }

export class FrappeError extends Error {
  constructor(message: string, public status: number, public excType?: string) { super(message); }
}

export type Filters = unknown[][] | Record<string, unknown>;

export class Frappe {
  private f: typeof fetch;
  constructor(private o: FrappeOptions) { this.f = o.fetch ?? fetch.bind(globalThis); }

  private async req<T>(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown, query?: Record<string, unknown>): Promise<T> {
    const url = new URL(path, this.o.baseUrl);
    for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) url.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v));
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.o.apiKey) headers.Authorization = `token ${this.o.apiKey}:${this.o.apiSecret}`;
    else if (method !== 'GET' && csrfToken()) headers['X-Frappe-CSRF-Token'] = csrfToken()!;
    const res = await this.f(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'include' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.exc_type) throw new FrappeError(serverMessage(json) ?? `${res.status} ${res.statusText}`, res.status, json.exc_type);
    return (json.data ?? json.message) as T;
  }

  login(usr: string, pwd: string) { return this.req<string>('POST', '/api/method/login', { usr, pwd }); }
  whoami() { return this.req<string>('GET', '/api/method/frappe.auth.get_logged_user'); }

  getList<T = Record<string, unknown>>(doctype: string, opts: { fields?: string[]; filters?: Filters; orderBy?: string; limit?: number } = {}) {
    return this.req<T[]>('GET', `/api/resource/${encodeURIComponent(doctype)}`, undefined, {
      fields: opts.fields ?? ['name'], filters: opts.filters, order_by: opts.orderBy, limit_page_length: opts.limit ?? 100,
    });
  }
  getDoc<T = Record<string, unknown>>(doctype: string, name: string) {
    return this.req<T>('GET', `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  }
  insert<T = Record<string, unknown>>(doc: { doctype: string } & Record<string, unknown>) {
    return this.req<T>('POST', `/api/resource/${encodeURIComponent(doc.doctype)}`, doc);
  }
  update<T = Record<string, unknown>>(doctype: string, name: string, patch: Record<string, unknown>) {
    return this.req<T>('PUT', `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`, patch);
  }
  /** Submit (docstatus 1) — this is when ERPNext posts GL and stock entries. */
  submit<T = Record<string, unknown>>(doc: Record<string, unknown>) { return this.call<T>('frappe.client.submit', { doc }); }
  cancel(doctype: string, name: string) { return this.call('frappe.client.cancel', { doctype, name }); }
  call<T = unknown>(method: string, args: Record<string, unknown> = {}) { return this.req<T>('POST', `/api/method/${method}`, args); }

  /** Insert and submit in one go, the equivalent of Tally's "Accept". */
  async post<T = Record<string, unknown>>(doc: { doctype: string } & Record<string, unknown>) {
    // frappe.client.insert accepts mapped drafts (from make_* methods) with their child rows as-is.
    const saved = await this.call<Record<string, unknown>>('frappe.client.insert', { doc });
    return this.submit<T>(saved);
  }

  runReport<T = unknown>(report: string, filters: Record<string, unknown>) {
    return this.call<{ result: T[]; columns: unknown[] }>('frappe.desk.query_report.run', { report_name: report, filters });
  }
}

/** Set by fluid_erp/www/fluid.py when the app is served from the ERPNext site. */
function csrfToken(): string | undefined {
  const t = (globalThis as { csrf_token?: string }).csrf_token;
  return t && !t.includes('{{') ? t : undefined;
}

/** Client for the site this page is served from (session cookie + CSRF token). */
export const sameSite = () => new Frappe({ baseUrl: globalThis.location?.origin ?? '' });

function serverMessage(json: Record<string, unknown>): string | undefined {
  try {
    if (typeof json._server_messages === 'string') {
      const msgs = JSON.parse(json._server_messages) as string[];
      return msgs.map((m) => (JSON.parse(m) as { message: string }).message.replace(/<[^>]+>/g, '')).join('\n');
    }
  } catch { /* fall through */ }
  return typeof json.exception === 'string' ? json.exception.split(':').slice(1).join(':').trim() || json.exception : undefined;
}
