'use client';

import { ArrowRight, LogOut, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

const storageKey = 'night-radar:app-age-confirmed';
const storageValue = 'v1';

type GateState = 'checking' | 'required' | 'denied' | 'confirmed';

export function AppAgeGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>('checking');
  const dialogRef = useRef<HTMLElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let nextState: GateState = 'required';
    try {
      nextState = window.localStorage.getItem(storageKey) === storageValue ? 'confirmed' : 'required';
    } catch {
      nextState = 'required';
    }
    window.queueMicrotask(() => setState(nextState));
  }, []);

  useEffect(() => {
    if (state === 'confirmed') return;

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    if (state === 'required') confirmButtonRef.current?.focus();

    function keepFocusInside(event: KeyboardEvent) {
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const controls = [...dialogRef.current.querySelectorAll<HTMLElement>('button, a[href]')]
        .filter((element) => !element.hasAttribute('disabled'));
      if (controls.length === 0) return;

      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', keepFocusInside);
    return () => {
      document.removeEventListener('keydown', keepFocusInside);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [state]);

  function confirmAge() {
    try {
      window.localStorage.setItem(storageKey, storageValue);
    } catch {
      // Storage can be unavailable in privacy modes; the current visit still continues.
    }
    setState('confirmed');
  }

  function leaveApp() {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.assign('https://www.google.co.jp/');
  }

  if (state === 'confirmed') return children;

  if (state === 'checking') {
    return (
      <main className="nr-age-gate nr-age-gate-checking" aria-live="polite">
        <span className="nr-age-gate-loader" aria-hidden="true" />
        <p>年齢確認を読み込んでいます</p>
      </main>
    );
  }

  return (
    <main className="nr-age-gate">
      <section
        ref={dialogRef}
        className="nr-age-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-age-gate-title"
        aria-describedby="app-age-gate-description"
      >
        <div className="nr-age-dialog-mark" aria-hidden="true">
          <ShieldCheck size={20} strokeWidth={1.8} />
        </div>
        <p className="nr-age-dialog-kicker">ナイトレーダー · 年齢確認</p>
        <h1 id="app-age-gate-title">18歳以上ですか？</h1>
        <p id="app-age-gate-description" className="nr-age-dialog-copy">
          このアプリは成人向け店舗に関する公開情報を扱います。18歳未満の方はご利用いただけません。
        </p>

        {state === 'denied' ? (
          <div className="nr-age-denied" role="status">
            <p>18歳未満の方はナイトレーダーをご利用いただけません。</p>
            <button type="button" className="nr-age-secondary" onClick={leaveApp}>
              <LogOut size={16} aria-hidden="true" />
              前のページへ戻る
            </button>
          </div>
        ) : (
          <div className="nr-age-actions">
            <button ref={confirmButtonRef} type="button" className="nr-age-primary" onClick={confirmAge}>
              18歳以上です
              <ArrowRight size={17} aria-hidden="true" />
            </button>
            <button type="button" className="nr-age-secondary" onClick={() => setState('denied')}>
              18歳未満です
            </button>
          </div>
        )}

        <p className="nr-age-dialog-note">確認結果は、このブラウザに保存されます。</p>
      </section>
    </main>
  );
}
