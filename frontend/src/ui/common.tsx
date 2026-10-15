import { flushSync } from 'react-dom';
import { ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Tone } from '../domain/engine';
import { fmtDate, parseDate, parseNum } from '../format';

export const Pill = ({ tone, children }: { tone: Tone; children: ReactNode }) => <span className={`pill ${tone}`}>{children}</span>;

export const Kbd = ({ children }: { children: ReactNode }) => <kbd>{children}</kbd>;

/** Move focus to the next/previous [data-nav] field inside the closest [data-form]. */
export function focusNext(from: Element, dir: 1 | -1 = 1) {
  const root = from.closest('[data-form]');
  if (!root) return;
  const fields = [...root.querySelectorAll<HTMLElement>('[data-nav]')].filter((el) => !(el as HTMLInputElement).disabled && el.offsetParent !== null);
  const i = fields.indexOf(from as HTMLElement);
  const next = fields[i + dir];
  if (next) {
    next.focus();
    if (next instanceof HTMLInputElement) next.select();
  }
}

/** Keyboard navigation over a list of rows: ↑ ↓ PgUp PgDn Home End, Enter to open. */
export function useListNav(count: number, onOpen: (i: number) => void, opts: { autoFocus?: boolean; onKey?: (e: React.KeyboardEvent, i: number) => boolean } = {}) {
  const [sel, setSel] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (sel >= count) setSel(Math.max(0, count - 1)); }, [count, sel]);
  useEffect(() => { if (opts.autoFocus !== false) ref.current?.focus({ preventScroll: true }); }, []); // eslint-disable-line
  useLayoutEffect(() => {
    ref.current?.querySelector(`[data-row="${sel}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [sel]);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (opts.onKey?.(e, sel)) { e.preventDefault(); return; }
    const k = e.key;
    const move = (n: number) => { e.preventDefault(); setSel(Math.max(0, Math.min(count - 1, n))); };
    if (k === 'ArrowDown') move(sel + 1);
    else if (k === 'ArrowUp') move(sel - 1);
    else if (k === 'PageDown') move(sel + 10);
    else if (k === 'PageUp') move(sel - 10);
    else if (k === 'Home') move(0);
    else if (k === 'End') move(count - 1);
    else if (k === 'Enter' && count) { e.preventDefault(); onOpen(sel); }
  };
  const rowProps = (i: number) => ({
    'data-row': i,
    className: i === sel ? 'sel' : undefined,
    onMouseDown: () => setSel(i),
    onDoubleClick: () => onOpen(i),
  });
  return { sel, setSel, ref, onKeyDown, rowProps };
}

export interface Option { id: string; label: string; hint?: string; sub?: string }

/**
 * Type-ahead picker. Shows live hints (balance, stock) next to each option.
 * Enter picks and moves to the next field; Enter on an empty picker calls onEmptyEnter;
 * Alt+C (or the last row) creates a new master from the typed text when onCreate is given.
 */
export function Picker(props: {
  value?: string;
  options: Option[];
  onChange: (id: string) => void;
  placeholder?: string;
  onCreate?: (text: string) => string | undefined;
  createLabel?: string;
  onEmptyEnter?: (el: HTMLInputElement) => void;
  autoFocus?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const { value, options, onChange, onCreate, createLabel = 'Create' } = props;
  const selected = options.find((o) => o.id === value);
  const [text, setText] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [moved, setMoved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const q = (text ?? '').trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return options.slice(0, 60);
    const words = q.split(/\s+/);
    // Rank: name starts with the text, then a word in the name starts with it, then name contains it,
    // and only then matches on the group/SKU line.
    const scored = options
      .map((o) => {
        const name = o.label.toLowerCase();
        const hay = name + ' ' + (o.sub ?? '').toLowerCase();
        if (!words.every((w) => hay.includes(w))) return null;
        const s = name.startsWith(q) ? 0 : words.every((w) => name.split(/[\s\-(),.&]+/).some((t) => t.startsWith(w))) ? 1 : words.every((w) => name.includes(w)) ? 2 : 3;
        return { o, s };
      })
      .filter(Boolean) as { o: Option; s: number }[];
    return scored.sort((a, b) => a.s - b.s).map((x) => x.o).slice(0, 60);
  }, [q, options]);
  const canCreate = !!onCreate && q.length > 1 && !options.some((o) => o.label.toLowerCase() === q);
  const total = filtered.length + (canCreate ? 1 : 0);

  useLayoutEffect(() => { listRef.current?.querySelector('.hi')?.scrollIntoView({ block: 'nearest' }); }, [hi, open]);

  const pick = (id: string, advance: boolean) => {
    // Commit synchronously so the next field exists and type-ahead keystrokes land in it.
    flushSync(() => {
      onChange(id);
      setText(null);
      setOpen(false);
      setMoved(false);
    });
    if (advance && inputRef.current) focusNext(inputRef.current, 1);
  };
  const create = (advance: boolean) => {
    const id = onCreate?.((text ?? '').trim());
    if (id) pick(id, advance);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setMoved(true); setHi((h) => Math.min(total - 1, h + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setMoved(true); setHi((h) => Math.max(0, h - 1)); }
    else if (e.altKey && e.key.toLowerCase() === 'c' && onCreate) { e.preventDefault(); create(true); }
    else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      const el = e.currentTarget;
      if (open && (text !== null || moved)) {
        if (!q && !moved && !value && props.onEmptyEnter) { setOpen(false); setText(null); props.onEmptyEnter(el); }
        else if (hi < filtered.length) pick(filtered[hi].id, true);
        else if (canCreate) create(true);
      } else if (!value && props.onEmptyEnter) props.onEmptyEnter(el);
      else focusNext(el, e.shiftKey ? -1 : 1);
    } else if (e.key === 'Escape' && open) { e.preventDefault(); setOpen(false); setText(null); }
    else if (e.key === 'Tab') { setOpen(false); setText(null); }
  };

  return (
    <div className={`picker ${props.className ?? ''}`}>
      <input
        ref={inputRef}
        data-nav
        autoFocus={props.autoFocus}
        disabled={props.disabled}
        value={text ?? selected?.label ?? ''}
        placeholder={props.placeholder}
        onChange={(e) => { setText(e.target.value); setOpen(true); setHi(0); }}
        onFocus={(e) => { e.target.select(); setOpen(true); setHi(Math.max(0, filtered.findIndex((o) => o.id === value))); }}
        onBlur={() => setTimeout(() => { setOpen(false); setText(null); setMoved(false); }, 120)}
        onKeyDown={onKeyDown}
      />
      {open && !props.disabled && (
        <div className="dropdown" ref={listRef}>
          {filtered.map((o, i) => (
            <div key={o.id} className={`opt ${i === hi ? 'hi' : ''} ${o.id === value ? 'cur' : ''}`} onMouseDown={(e) => { e.preventDefault(); pick(o.id, true); }}>
              <span className="opt-label">{o.label}{o.sub && <small>{o.sub}</small>}</span>
              {o.hint && <span className="opt-hint">{o.hint}</span>}
            </div>
          ))}
          {canCreate && (
            <div className={`opt create ${hi === filtered.length ? 'hi' : ''}`} onMouseDown={(e) => { e.preventDefault(); create(true); }}>
              <span>+ {createLabel} “{(text ?? '').trim()}”</span>
              <span className="opt-hint"><Kbd>Alt+C</Kbd></span>
            </div>
          )}
          {!total && <div className="opt empty">No match</div>}
        </div>
      )}
    </div>
  );
}

/** Numeric input that shows a formatted value and selects on focus. Enter moves on. */
export function NumInput(props: { value: number; onChange: (n: number) => void; disabled?: boolean; className?: string; onEnter?: (el: HTMLInputElement) => boolean; autoFocus?: boolean }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <input
      data-nav
      className={`num ${props.className ?? ''}`}
      inputMode="decimal"
      autoFocus={props.autoFocus}
      disabled={props.disabled}
      value={text ?? (props.value ? String(props.value) : '')}
      onChange={(e) => { setText(e.target.value); props.onChange(parseNum(e.target.value)); }}
      onFocus={(e) => e.target.select()}
      onBlur={() => setText(null)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          if (props.onEnter?.(e.currentTarget)) return;
          focusNext(e.currentTarget, e.shiftKey ? -1 : 1);
        }
      }}
    />
  );
}

/** Date input accepting shorthand ("15", "15-10", "t", "+2"); shows DD-Mon-YYYY. */
export function DateInput(props: { value: string; onChange: (iso: string) => void; disabled?: boolean; autoFocus?: boolean }) {
  const [text, setText] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const commit = () => {
    if (text === null) return true;
    const iso = parseDate(text, props.value);
    if (!iso) { setBad(true); return false; }
    props.onChange(iso);
    setText(null);
    setBad(false);
    return true;
  };
  return (
    <input
      data-nav
      className={`date ${bad ? 'bad' : ''}`}
      disabled={props.disabled}
      autoFocus={props.autoFocus}
      value={text ?? fmtDate(props.value)}
      title="Type 15, 15-10, 15 oct, t for today, +1 / -1"
      onChange={(e) => setText(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={() => { if (!commit()) setText(null); setBad(false); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          if (commit()) focusNext(e.currentTarget, e.shiftKey ? -1 : 1);
        }
      }}
    />
  );
}

export function TextInput(props: { value: string; onChange: (s: string) => void; placeholder?: string; autoFocus?: boolean; disabled?: boolean; multiline?: boolean }) {
  const common = {
    'data-nav': true,
    value: props.value,
    placeholder: props.placeholder,
    autoFocus: props.autoFocus,
    disabled: props.disabled,
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !(props.multiline && e.shiftKey)) {
        e.preventDefault();
        focusNext(e.currentTarget, 1);
      }
    },
  };
  return props.multiline
    ? <textarea rows={2} {...common} onChange={(e) => props.onChange(e.target.value)} />
    : <input {...common} onChange={(e) => props.onChange(e.target.value)} />;
}

export function Modal(props: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="modal-back" onMouseDown={props.onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); props.onClose(); } }}>
        <h3>{props.title}</h3>
        {props.children}
      </div>
    </div>
  );
}

export function PageHead(props: { title: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{props.title}</h1>
        {props.sub && <div className="sub">{props.sub}</div>}
      </div>
      <div className="head-actions">{props.children}</div>
    </div>
  );
}
