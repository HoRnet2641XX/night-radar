import { motion } from 'motion/react';
import { GlassCard } from '../ui-nr/GlassCard';
import { WordReveal, Stagger, StaggerItem } from '../ui-nr/Reveal';
import { LogOut, Shield, Activity, Database, CheckCircle2, FileText } from 'lucide-react';
import { RUNTIME_META } from '../data/mock';

const ease = [0.22, 1, 0.36, 1] as const;

export function AccountPage() {
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
          <WordReveal text="アカウントとデータ状態" />
        </h1>
        <motion.p className="text-[14px] mt-4 max-w-[60ch] leading-[1.7]" style={{ color: 'var(--nr-text-mid)' }}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease, delay: 0.5 }}>
          Xログインの状態と、BBSデータの取得件数・正規化率を確認できます。
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
            <div className="text-[16px]" style={{ color: 'var(--nr-text-hi)' }}>{RUNTIME_META.userDisplayName}</div>
            <div className="text-[11px]" style={{ color: 'var(--nr-text-low)' }}>X認証 · {RUNTIME_META.modeLabel} · {RUNTIME_META.planLabel}プラン</div>
          </div>
          <span className="nr-chip">{RUNTIME_META.planLabel}プラン</span>
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
            <span className="text-[13px]" style={{ color: 'var(--nr-text-hi)' }}>{RUNTIME_META.userEmail || 'Xアカウントでログイン中'}</span>
            <span className="nr-mono text-[11px]" style={{ color: 'var(--nr-text-low)' }}>最終集計 · {RUNTIME_META.generatedAtLabel} JST</span>
          </div>
          <button className="nr-chip flex items-center gap-1.5" onClick={signOut}><LogOut size={12} /> ログアウト</button>
        </div>
        <p className="text-[11px] mt-3 leading-relaxed" style={{ color: 'var(--nr-text-low)' }}>
          ログアウト後は、X認証から再度ログインできます。
        </p>
      </GlassCard>

      {/* Data status */}
      <Stagger delay={0.2} gap={0.08}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { icon: Activity, title: 'BBS巡回元', sub: '有効な取得対象', meta: `${RUNTIME_META.sourceCount}件` },
            { icon: CheckCircle2, title: 'データ信頼度80%以上', sub: '取得鮮度・正規化・投稿者名・性別・件数から算出', meta: `${RUNTIME_META.highConfidenceCount}店` },
            { icon: Database, title: '書き込み時刻を解析', sub: '営業分の集計に使える投稿の割合', meta: `${RUNTIME_META.timestampCoverageAverage}%` },
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
          データ信頼度は、取得鮮度25%、正規化20%、書き込み時刻20%、投稿者名10%、性別15%、営業分の投稿件数10%の加重値です。投稿内容の事実性を保証する数値ではありません。
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
