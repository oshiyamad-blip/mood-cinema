// 共通の小さな部品：トースト（元に戻すつき）、確認ダイアログ、検査の印、空状態。

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Issue, Severity } from '../core/schedule';

// ---- トースト ----

interface Toast {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

const ToastCtx = createContext<(t: Omit<Toast, 'id'>) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = ++seq.current;
    setToasts((xs) => [...xs.slice(-2), { ...t, id }]);
    window.setTimeout(() => setToasts((xs) => xs.filter((x) => x.id !== id)), t.action ? 10000 : 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts no-print" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            <span>{t.text}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action!.run();
                  setToasts((xs) => xs.filter((x) => x.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}

// ---- 確認ダイアログ ----

interface ConfirmOpts {
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
}

const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOpts | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const ref = useRef<HTMLDialogElement>(null);
  const ask = useCallback((o: ConfirmOpts) => {
    setOpts(o);
    return new Promise<boolean>((res) => {
      resolver.current = res;
    });
  }, []);
  useEffect(() => {
    if (opts && ref.current && !ref.current.open) ref.current.showModal();
  }, [opts]);
  const close = (v: boolean) => {
    ref.current?.close();
    resolver.current?.(v);
    resolver.current = null;
    setOpts(null);
  };
  return (
    <ConfirmCtx.Provider value={ask}>
      {children}
      {opts && (
        <dialog ref={ref} className="dialog" onCancel={() => close(false)} aria-labelledby="confirm-title">
          <h2 id="confirm-title">{opts.title}</h2>
          {opts.body && <div className="dialog-body">{opts.body}</div>}
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={() => close(false)} autoFocus>
              やめる
            </button>
            <button type="button" className={opts.danger ? 'btn btn-danger' : 'btn btn-primary'} onClick={() => close(true)}>
              {opts.confirmLabel}
            </button>
          </div>
        </dialog>
      )}
    </ConfirmCtx.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmCtx);
}

// ---- 検査の印（色・記号・語の3つで区別する、06 2.2） ----

const SEV_LABEL: Record<Severity, string> = { error: 'エラー', warn: '警告', info: '注意' };

export function SevIcon({ severity }: { severity: Severity }) {
  if (severity === 'error') {
    return (
      <svg className="sev-icon" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M5 1h6l4 4v6l-4 4H5l-4-4V5z" fill="currentColor" />
        <path d="M5.5 5.5l5 5m0-5l-5 5" stroke="var(--on-err)" strokeWidth="1.6" />
      </svg>
    );
  }
  if (severity === 'warn') {
    return (
      <svg className="sev-icon" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M8 1.5L15 14H1z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M8 6v4" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="8" cy="12" r="0.9" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg className="sev-icon" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 7v4.5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="8" cy="4.8" r="0.9" fill="currentColor" />
    </svg>
  );
}

export function IssueList({ issues }: { issues: Issue[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="issues">
      {issues.map((i, k) => (
        <li key={k} className={`issue issue-${i.severity}`}>
          <SevIcon severity={i.severity} />
          <span className="issue-label">{SEV_LABEL[i.severity]}</span>
          <span>{i.message}</span>
        </li>
      ))}
    </ul>
  );
}

export function IssueCount({ issues }: { issues: Issue[] }) {
  const e = issues.filter((i) => i.severity === 'error').length;
  const w = issues.filter((i) => i.severity === 'warn').length;
  if (e === 0 && w === 0) return null;
  return (
    <span className="issue-count">
      {e > 0 && (
        <span className="issue issue-error">
          <SevIcon severity="error" />
          エラー{e}
        </span>
      )}
      {w > 0 && (
        <span className="issue issue-warn">
          <SevIcon severity="warn" />
          警告{w}
        </span>
      )}
    </span>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {children}
    </div>
  );
}

/** クリップボードへ写す。使えない環境では選択できる欄を出すよう false を返す */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function downloadText(filename: string, text: string, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
