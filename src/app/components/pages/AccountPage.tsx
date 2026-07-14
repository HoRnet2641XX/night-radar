import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { GlassCard } from '../ui-nr/GlassCard';
import { WordReveal, Stagger, StaggerItem } from '../ui-nr/Reveal';
import { LogOut, Shield, Activity, Database, CheckCircle2, FileText, Bookmark, Trash2, X, BellRing } from 'lucide-react';
import { useNightRadarData } from '../data/runtime';
import { useLocalPreferences } from '../data/local-preferences';

const ease = [0.22, 1, 0.36, 1] as const;

export function AccountPage() {
  const { meta, bars } = useNightRadarData();
  const { savedWords, candidateStoreIds, toggleWord, toggleCandidateStore, clearPreferences } = useLocalPreferences();
  const candidateBars = candidateStoreIds.map((id) => bars.find((bar) => bar.id === id)).filter(Boolean);
  const [notificationSupported, setNotificationSupported] = useState(false);
  const [candidateNotificationEnabled, setCandidateNotificationEnabled] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const supported = 'Notification' in window;
      setNotificationSupported(supported);
      setCandidateNotificationEnabled(
        supported && Notification.permission === 'granted' && window.localStorage.getItem('night-radar:candidate-notification') === 'enabled',
      );
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  async function toggleCandidateNotification() {
    if (!notificationSupported) return;
    if (candidateNotificationEnabled) {
      window.localStorage.removeItem('night-radar:candidate-notification');
      setCandidateNotificationEnabled(false);
      return;
    }
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (permission !== 'granted') return;
    window.localStorage.setItem('night-radar:candidate-notification', 'enabled');
    setCandidateNotificationEnabled(true);
    new Notification('Night Radarの通知を有効にしました', {
      body: '18時以降にアプリを開いている時、当日の候補を1日1回お知らせします。',
      icon: '/icons/icon-192.png',
    });
  }
  async function signOut() {
    await fetch('/api/auth/signout', { method: 'POST' });
    window.location.assign('/');
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="pt-4">
        <motion.div className="flex items-center gap-2 mb-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, ease }}>
          <span className="nr-pulse" />
          <span className="nr-mono text-[12px]" style={{ color: 'var(--nr-text-mid)' }}>設定</span>
        </motion.div>
        <h1 className="nr-heading text-[34px] sm:text-[40px]" style={{ color: 'var(--nr-text-hi)' }}>
          <WordReveal text="データ状態と利用設定" />
        </h1>
        <motion.p className="text-[14px] mt-4 max-w-[60ch] leading-[1.7]" style={{ color: 'var(--nr-text-mid)' }}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease, delay: 0.5 }}>
          BBSデータの取得件数・正規化率と、この端末の利用状態を確認できます。
        </motion.p>
      </div>

      {/* Profile */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease, delay: 0.7 }}>
        <GlassCard className="p-5 flex items-center gap-4 nr-hairline">
          <div className="w-14 h-14 rounded-full grid place-items-center" style={{
            background: 'linear-gradient(135deg, #FFB8A8, #E24A3A)',
            boxShadow: '0 0 24px var(--nr-accent-glow), inset 0 1px 0 rgba(255,255,255,0.3)'
          }}>
            <span className="nr-heading text-[22px]" style={{ color: '#0A0B10' }}>N</span>
          </div>
          <div className="flex-1">
            <div className="text-[16px]" style={{ color: 'var(--nr-text-hi)' }}>{meta.userDisplayName}</div>
            <div className="text-[11px]" style={{ color: 'var(--nr-text-low)' }}>{meta.authenticated ? 'アカウント連携済み' : 'ログイン不要で利用中'} · {meta.modeLabel}</div>
          </div>
          <span className="nr-chip">{meta.planLabel}プラン</span>
        </GlassCard>
      </motion.div>

      {/* Auth block */}
      <GlassCard className="p-5 nr-hairline">
        <div className="flex items-center gap-2 mb-3">
          <Shield size={14} color="var(--nr-accent)" />
          <span className="nr-mono text-[12px]" style={{ color: 'var(--nr-text-mid)' }}>ログイン状態</span>
        </div>
        <div className="flex items-center justify-between rounded-xl px-3 py-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--nr-border)' }}>
          <div className="flex flex-col">
            <span className="text-[13px]" style={{ color: 'var(--nr-text-hi)' }}>{meta.authenticated ? meta.userEmail || 'アカウント連携済み' : '現在はログインなしで利用できます'}</span>
            <span className="nr-mono text-[11px]" style={{ color: 'var(--nr-text-low)' }}>最終集計 · {meta.generatedAtLabel} JST</span>
          </div>
          {meta.authenticated && <button className="nr-chip flex items-center gap-1.5" onClick={signOut}><LogOut size={12} /> ログアウト</button>}
        </div>
        <p className="text-[11px] mt-3 leading-relaxed" style={{ color: 'var(--nr-text-low)' }}>
          ログイン機能は別の用途へ移行中です。店舗比較・検索・予定確認はログインせず利用できます。
        </p>
      </GlassCard>

      <GlassCard className="p-5 nr-hairline">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <BellRing size={17} color="var(--nr-accent)" className="mt-0.5 shrink-0" />
            <div>
              <div className="text-[13px]" style={{ color: 'var(--nr-text-hi)' }}>今日の候補を端末通知</div>
              <p className="mt-1 text-[11px] leading-relaxed" style={{ color: 'var(--nr-text-low)' }}>
                18時以降にこのアプリを開いている時、当日投稿1位を1日1回通知します。この端末だけに設定されます。
              </p>
            </div>
          </div>
          <button
            type="button"
            className="nr-secondary-btn min-w-[112px]"
            data-active={candidateNotificationEnabled}
            disabled={!notificationSupported}
            aria-pressed={candidateNotificationEnabled}
            onClick={toggleCandidateNotification}
          >
            {!notificationSupported ? '非対応' : candidateNotificationEnabled ? '通知を止める' : '通知を受け取る'}
          </button>
        </div>
      </GlassCard>

      <GlassCard className="p-5 nr-hairline">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2"><Bookmark size={14} color="var(--nr-accent)" /><span className="nr-mono text-[12px]" style={{ color: 'var(--nr-text-mid)' }}>この端末の保存</span></div>
            <p className="mt-2 text-[11px] leading-relaxed" style={{ color: 'var(--nr-text-low)' }}>検索語と店舗候補はアカウントではなく、このブラウザに保存されます。</p>
          </div>
          {(savedWords.length > 0 || candidateBars.length > 0) && <button type="button" className="nr-chip flex items-center gap-1.5" onClick={clearPreferences}><Trash2 size={11} /> すべて削除</button>}
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <div className="nr-mono mb-2 text-[10px]" style={{ color: 'var(--nr-text-low)' }}>保存した検索語 · {savedWords.length}件</div>
            <div className="flex flex-wrap gap-2">
              {savedWords.map((word) => <button key={word} type="button" className="nr-chip" onClick={() => toggleWord(word)}>{word}<X size={10} /></button>)}
              {savedWords.length === 0 && <span className="text-[11px]" style={{ color: 'var(--nr-text-low)' }}>まだ保存されていません。</span>}
            </div>
          </div>
          <div>
            <div className="nr-mono mb-2 text-[10px]" style={{ color: 'var(--nr-text-low)' }}>店舗候補 · {candidateBars.length}店</div>
            <div className="flex flex-wrap gap-2">
              {candidateBars.map((bar) => bar && <button key={bar.id} type="button" className="nr-chip" onClick={() => toggleCandidateStore(bar.id)}>{bar.name}<X size={10} /></button>)}
              {candidateBars.length === 0 && <span className="text-[11px]" style={{ color: 'var(--nr-text-low)' }}>まだ保存されていません。</span>}
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Data status */}
      <Stagger delay={0.2} gap={0.08}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { icon: Activity, title: 'BBS巡回元', sub: '有効な取得対象', meta: `${meta.sourceCount}件` },
            { icon: CheckCircle2, title: '集計信頼度80点以上', sub: '取得鮮度・正規化・投稿時刻・件数から算出', meta: `${meta.highConfidenceCount}店` },
            { icon: Database, title: '書き込み時刻を解析', sub: '当日顧客投稿の順位に使える割合', meta: `${meta.timestampCoverageAverage}%・解析保留 ${meta.excludedUntimestampedCount}件` },
          ].map((c, i) => (
            <StaggerItem key={i}>
              <GlassCard className="p-4 flex flex-col gap-2 nr-hairline">
                <c.icon size={16} color="var(--nr-accent)" />
                <span className="text-[13px]" style={{ color: 'var(--nr-text-hi)' }}>{c.title}</span>
                <span className="text-[11px]" style={{ color: 'var(--nr-text-low)' }}>{c.sub}</span>
                <span className="nr-mono text-[10px] mt-1" style={{ color: 'var(--nr-accent-soft)' }}>{c.meta}</span>
              </GlassCard>
            </StaggerItem>
          ))}
        </div>
      </Stagger>

      <GlassCard className="p-4 nr-hairline">
        <div className="text-[12px] leading-relaxed" style={{ color: 'var(--nr-text-mid)' }}>
          集計信頼度は、取得鮮度30点、正規化20点、書き込み時刻35点、当日顧客投稿の件数15点を上限に算出します。性別はランキングと集計信頼度に使用しません。投稿内容の事実性を保証する数値ではありません。
        </div>
      </GlassCard>

      {/* Legal */}
      <GlassCard className="p-4 flex items-center gap-4 flex-wrap nr-hairline">
        <div className="text-[11px] flex-1 leading-relaxed" style={{ color: 'var(--nr-text-low)' }}>
          Night Radarは公開BBSの投稿件数と公式イベントを店舗別に整理します。来店状況や参加を保証するものではありません。
        </div>
        <div className="flex items-center gap-2">
          <a href="/terms" className="nr-chip flex items-center gap-1.5"><FileText size={12} /> 利用規約</a>
          <a href="/privacy" className="nr-chip flex items-center gap-1.5"><FileText size={12} /> プライバシー</a>
        </div>
      </GlassCard>
    </div>
  );
}
