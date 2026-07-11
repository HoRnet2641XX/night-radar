import { motion, AnimatePresence } from 'motion/react';
import { Home, Search, CalendarDays, Radar, User, X, Activity, type LucideIcon } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

export type TabKey = 'home' | 'detail' | 'search' | 'schedule' | 'account';

const TABS: { key: TabKey; label: string; icon: LucideIcon }[] = [
  { key: 'home', label: 'ホーム', icon: Home },
  { key: 'detail', label: '店舗詳細', icon: Radar },
  { key: 'search', label: '探す', icon: Search },
  { key: 'schedule', label: '予定', icon: CalendarDays },
  { key: 'account', label: '設定', icon: User },
];

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const ease = [0.22, 1, 0.36, 1] as const;

export function AppShell({ tab, onTab, children }: { tab: TabKey; onTab: (t: TabKey) => void; children: ReactNode }) {
  const [banner, setBanner] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
      setBanner(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  async function installApp() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
    setBanner(false);
  }

  return (
    <div className="relative min-h-screen w-full flex justify-center" style={{ zIndex: 1 }}>
      <div className="w-full max-w-[1120px] px-4 sm:px-6 pt-4 sm:pt-6 pb-32 relative" style={{ zIndex: 1 }}>
        {/* Header — flat editorial */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div className="flex items-baseline gap-3">
            <div className="w-6 h-6 rounded-full grid place-items-center relative" style={{
              background: 'radial-gradient(circle at 30% 30%, #FFB8A8, #E24A3A)',
              boxShadow: '0 0 14px var(--nr-accent-glow)'
            }}>
              <span className="nr-pulse" style={{ width: 4, height: 4, background: 'rgba(0,0,0,0.4)' }} />
            </div>
            <span className="nr-heading text-[15px]" style={{ color: 'var(--nr-text-hi)' }}>ナイトレーダー</span>
            <span className="text-[11px]" style={{ color: 'var(--nr-text-low)' }}>直近のBBSと今日の予定を比較</span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="nr-chip flex items-center gap-1.5" onClick={() => onTab('search')}><Radar size={12} /> 投稿を探す</button>
            <button type="button" className="nr-chip flex items-center gap-1.5" onClick={() => onTab('account')}><Activity size={12} /> データ状態</button>
          </div>
        </header>

        {/* Banner — quiet editorial notice */}
        <AnimatePresence>
          {banner && installPrompt && (
            <motion.div
              initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.7, ease }}
              className="mb-6 flex items-center justify-between gap-4 px-4 py-2.5 rounded-xl"
              style={{ border: '1px solid var(--nr-border)', background: 'rgba(255,255,255,0.02)' }}
            >
              <div className="flex items-center gap-3">
                <span className="nr-mono text-[11px] px-1.5 py-0.5 rounded" style={{ color: 'var(--nr-accent-soft)', background: 'rgba(255,106,91,0.08)', border: '1px solid rgba(255,106,91,0.25)' }}>アプリ追加</span>
                <span className="text-[12px]" style={{ color: 'var(--nr-text-mid)' }}>
                  Chrome のホーム画面に追加すると、ワンタップで今日の候補を確認できます。
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={installApp} className="nr-chip" data-accent="true">ホーム画面に追加</button>
                <button type="button" aria-label="ホーム画面追加の案内を閉じる" onClick={() => setBanner(false)} className="p-1 rounded-full hover:bg-white/5"><X size={12} color="var(--nr-text-mid)" /></button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Content */}
        <main id="main">
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={false}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
              transition={{ duration: 0.55, ease }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Bottom tab bar */}
      <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-50 w-[calc(100%-1rem)] sm:w-auto">
        <div className="nr-glass rounded-full px-1.5 sm:px-2 py-2 flex items-center justify-between sm:justify-start gap-0.5 sm:gap-1" style={{ backdropFilter: 'blur(24px)' }}>
          {TABS.map(t => {
            const active = tab === t.key;
            const Icon = t.icon;
            return (
              <button key={t.key} type="button" aria-current={active ? 'page' : undefined} onClick={() => onTab(t.key)}
                className="relative px-2.5 sm:px-4 py-2.5 rounded-full flex items-center gap-1.5 min-w-0"
                style={{ color: active ? '#1a0603' : 'var(--nr-text-mid)', transition: 'color 400ms var(--ease-out-quint)' }}
              >
                {active && (
                  <motion.div layoutId="tab-pill" className="absolute inset-0 rounded-full nr-accent-btn"
                    transition={{ type: 'spring', stiffness: 260, damping: 28 }} />
                )}
                <Icon size={15} className="relative z-10" />
                <span className="text-[11px] sm:text-[12px] relative z-10 whitespace-nowrap">{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
