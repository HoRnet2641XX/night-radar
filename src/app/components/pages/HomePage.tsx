import { motion, useMotionValue, useMotionTemplate } from 'motion/react';
import { ArrowUpRight, MapPin, TrendingUp, Sparkles, Clock, Users } from 'lucide-react';
import { GlassCard } from '../ui-nr/GlassCard';
import { MetricRing } from '../ui-nr/MetricRing';
import { Sparkline } from '../ui-nr/Sparkline';
import { DigitRoll } from '../ui-nr/DigitRoll';
import { WordReveal, Stagger, StaggerItem } from '../ui-nr/Reveal';
import { Ticker } from '../ui-nr/Ticker';
import { BARS, EVENTS, RUNTIME_META, TICKER, type Bar } from '../data/mock';
import { useRef, useState } from 'react';

const FILTERS = ['すべて', '営業時間内', '直近3時間', '女性書き込みあり', '初回来店の記述', '複数来店の記述', '予定あり', '集計信頼度80点以上'];
const ease = [0.22, 1, 0.36, 1] as const;

function matchesFilter(bar: Bar, filter: string) {
  if (filter === '女性書き込みあり') return bar.femaleCount > 0;
  if (filter === '営業時間内') return bar.isWithinBusinessHours;
  if (filter === '直近3時間') return bar.recentThreeHourCount > 0;
  if (filter === '初回来店の記述') return bar.firstVisitCount > 0;
  if (filter === '複数来店の記述') return bar.groupCount > 0;
  if (filter === '予定あり') return bar.eventCount > 0;
  if (filter === '集計信頼度80点以上') return bar.dataConfidence >= 80;
  return true;
}

export function HomePage({ onOpen, onNavigate }: { onOpen: (id: string) => void; onNavigate: (tab: 'search' | 'schedule' | 'account') => void }) {
  const [filter, setFilter] = useState('すべて');
  const visibleBars = BARS.filter((bar) => matchesFilter(bar, filter));
  const totalFemale = BARS.reduce((sum, bar) => sum + bar.femaleCount, 0);
  const currentMonthEventCount = EVENTS.filter((event) => event.date.startsWith(RUNTIME_META.currentMonth)).length;
  const activeRecentStores = BARS.filter((bar) => bar.recentThreeHourCount > 0).length;
  const postMax = Math.max(1, ...BARS.map((bar) => bar.postCount));
  const femaleMax = Math.max(1, ...BARS.map((bar) => bar.femaleCount));
  const recentMax = Math.max(1, ...BARS.map((bar) => bar.recentThreeHourCount));

  const mx = useMotionValue(50); const my = useMotionValue(50);
  const bg = useMotionTemplate`radial-gradient(600px 300px at ${mx}% ${my}%, rgba(255,106,91,0.10), transparent 60%)`;
  const heroRef = useRef<HTMLDivElement>(null);

  return (
    <div className="flex flex-col gap-7">
      {/* Ticker */}
      <Ticker items={TICKER} />

      {/* Hero — asymmetric editorial */}
      <motion.div
        ref={heroRef}
        onMouseMove={e => {
          const r = heroRef.current!.getBoundingClientRect();
          mx.set(((e.clientX - r.left) / r.width) * 100);
          my.set(((e.clientY - r.top) / r.height) * 100);
        }}
        className="relative grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-6 lg:gap-8 items-end pt-2 sm:pt-4 pb-4 sm:pb-6"
      >
        <motion.div className="absolute inset-0 pointer-events-none" style={{ background: bg }} />
        <div className="relative">
          <motion.div
            className="flex items-center gap-2 mb-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, ease }}
          >
            <span className="nr-pulse" />
            <span className="nr-mono text-[11px]" style={{ color: 'var(--nr-text-mid)' }}>最終集計 · {RUNTIME_META.generatedAtLabel}（日本時間）</span>
          </motion.div>
          <h1 className="nr-heading text-[36px] sm:text-[42px] leading-[1.12]" style={{ color: 'var(--nr-text-hi)' }}>
            <WordReveal text="今夜の候補を、" />
            <br />
            <span style={{ color: 'var(--nr-accent)' }}><WordReveal text="直近の投稿で比べる。" delay={0.35} /></span>
          </h1>
          <motion.p
            className="text-[14px] mt-4 max-w-[60ch] leading-[1.7]"
            style={{ color: 'var(--nr-text-mid)' }}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease, delay: 0.7 }}
          >
            当日営業分の顧客投稿数を主順位にし、同数の場合だけ直近3時間と集計信頼度で比べます。性別は順位に使いません。
          </motion.p>
        </div>
        <motion.div
          className="relative flex flex-col items-start lg:items-end gap-2"
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease, delay: 0.5 }}
        >
          <span className="nr-mono text-[12px]" style={{ color: 'var(--nr-text-mid)' }}>直近3時間に投稿があった店舗</span>
          <div className="nr-heading text-[56px] sm:text-[64px] leading-none" style={{ color: 'var(--nr-text-hi)' }}>
            <DigitRoll value={`${activeRecentStores}店`} delay={0.6} />
          </div>
          <div className="nr-mono text-[12px]" style={{ color: 'var(--nr-text-mid)' }}>投稿 {RUNTIME_META.recentThreeHourCount}件 / 対象 {BARS.length}店</div>
          <button
            className="nr-accent-btn rounded-full px-4 py-2 text-[13px] flex items-center gap-1.5 mt-1"
            onClick={() => BARS[0] && onOpen(BARS[0].id)}
            disabled={!BARS.length}
          >
            当日投稿1位の店舗を見る <ArrowUpRight size={14} />
          </button>
        </motion.div>
      </motion.div>

      {/* KPI row */}
      <Stagger delay={0.9} gap={0.08}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: '当日営業分', value: RUNTIME_META.postCount, suffix: '件', hint: '顧客投稿のみ' },
            { label: '直近3時間', value: RUNTIME_META.recentThreeHourCount, suffix: '件', hint: 'BBS投稿' },
            { label: '女性書き込み', value: totalFemale, suffix: '件', hint: '性別判定済み' },
            { label: '今日の予定', value: RUNTIME_META.todayEventCount, suffix: '件', hint: '公式URL登録済み' },
          ].map((k, i) => (
            <StaggerItem key={i}>
              <GlassCard className="p-4 flex flex-col gap-1.5 nr-focus nr-hairline">
                <span className="nr-mono text-[12px]" style={{ color: 'var(--nr-text-mid)' }}>{k.label}</span>
                <span className="nr-heading text-[28px]" style={{ color: 'var(--nr-text-hi)' }}>
                  <DigitRoll value={`${k.value}${k.suffix ?? ''}`} />
                </span>
                <span className="text-[11px]" style={{ color: 'var(--nr-text-low)' }}>{k.hint}</span>
              </GlassCard>
            </StaggerItem>
          ))}
        </div>
      </Stagger>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="nr-mono text-[11px] mr-1" style={{ color: 'var(--nr-text-mid)' }}>絞り込み</span>
        {FILTERS.map((item) => (
          <button key={item} type="button" className="nr-chip" data-active={filter === item} aria-pressed={filter === item} onClick={() => setFilter(item)}>{item}</button>
        ))}
      </div>

      {/* Bar cards */}
      <Stagger delay={0.2} gap={0.09}>
        <div className="flex flex-col gap-3">
          {visibleBars.slice(0, 3).map((b) => {
            return (
              <StaggerItem key={b.id}>
                <GlassCard interactive onClick={() => onOpen(b.id)} className="p-4 sm:p-6 nr-focus nr-hairline nr-sheen">
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-[1.5fr_repeat(4,1fr)_1.6fr] gap-5 xl:gap-6 items-center">
                    <div className="flex flex-col gap-1.5 sm:col-span-2 xl:col-span-1">
                      <div className="flex items-center gap-2">
                        <span className="nr-mono text-[11px]" style={{ color: 'var(--nr-accent-soft)' }}>当日投稿 {b.rank}位</span>
                        <span className="nr-mono text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,106,91,0.10)', color: 'var(--nr-accent-soft)' }}>
                          {b.businessStatusLabel}
                        </span>
                        <span className="nr-mono ml-auto px-1.5 py-0.5 rounded-full text-[10px] flex items-center gap-1 nr-delta-up">
                          <Sparkles size={10} />順位根拠 {b.postCount}件
                        </span>
                      </div>
                      <h3 className="nr-heading text-[26px] leading-[1.05]" style={{ color: 'var(--nr-text-hi)' }}>{b.name}</h3>
                      <div className="flex items-center gap-4 text-[11px]" style={{ color: 'var(--nr-text-mid)' }}>
                        <span className="flex items-center gap-1"><MapPin size={10} /> {b.area}</span>
                        <span className="flex items-center gap-1 nr-mono"><Clock size={10} /> {b.businessWindowLabel}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {b.tags.map(t => <span key={t} className="text-[10px]" style={{ color: 'var(--nr-text-low)' }}>{t}</span>)}
                      </div>
                    </div>
                    <MetricRing value={b.postCount} max={postMax} label="営業分投稿" color="var(--nr-accent)" />
                    <MetricRing value={b.femaleCount} max={femaleMax} label="女性書き込み" color="var(--nr-accent-2)" />
                    <MetricRing value={b.recentThreeHourCount} max={recentMax} label="直近3時間" color="var(--nr-accent-soft)" />
                    <MetricRing value={b.dataConfidence} label="集計信頼度" color="var(--nr-accent-deep)" />
                    <div className="flex flex-col gap-2 items-start sm:items-end sm:col-span-2 xl:col-span-1">
                      <div className="flex items-center gap-1.5 nr-mono text-[10px]" style={{ color: 'var(--nr-text-mid)' }}>
                        <TrendingUp size={10} color="var(--nr-accent)" /> 営業分の投稿推移
                      </div>
                      <Sparkline data={b.trend} w={190} h={44} color="var(--nr-accent)" />
                      <div className="flex items-start gap-1.5 max-w-[240px] mt-1">
                        <Sparkles size={11} color="var(--nr-accent)" className="mt-0.5 shrink-0" />
                        <p className="text-[12px] sm:text-right leading-relaxed" style={{ color: 'var(--nr-text-mid)' }}>{b.reason}</p>
                      </div>
                    </div>
                  </div>
                </GlassCard>
              </StaggerItem>
            );
          })}
          {visibleBars.length === 0 && (
            <GlassCard className="p-6 nr-hairline">
              <p className="text-[13px]" style={{ color: 'var(--nr-text-mid)' }}>この条件に一致する店舗はありません。絞り込みを外して確認してください。</p>
            </GlassCard>
          )}
        </div>
      </Stagger>

      <div className="nr-divider" />

      {/* Sub CTA row */}
      <div>
        <div className="flex items-baseline gap-3 mb-4">
          <span className="nr-mono text-[12px]" style={{ color: 'var(--nr-text-mid)' }}>次に確認する</span>
          <h2 className="nr-heading text-[22px]" style={{ color: 'var(--nr-text-hi)' }}>条件・予定・取得状態を確認</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { icon: TrendingUp, title: '条件から探す', sub: '女性書き込み・直近更新・予定で絞る', meta: `${BARS.length}店から検索`, tab: 'search' as const },
            { icon: Clock, title: '予定を確認する', sub: '日付と時間帯から公式予定を見る', meta: `今日 ${RUNTIME_META.todayEventCount}件 / 今月 ${currentMonthEventCount}件`, tab: 'schedule' as const },
            { icon: Users, title: '取得状態を見る', sub: '鮮度・投稿者名・性別・正規化率を確認', meta: `信頼度80%以上 ${RUNTIME_META.highConfidenceCount}店`, tab: 'account' as const },
          ].map((c, i) => (
            <GlassCard key={i} interactive onClick={() => onNavigate(c.tab)} className="p-5 flex items-center gap-3 nr-focus nr-hairline">
              <div className="w-10 h-10 rounded-xl grid place-items-center" style={{ background: 'rgba(255,106,91,0.10)', border: '1px solid rgba(255,106,91,0.22)' }}>
                <c.icon size={16} color="var(--nr-accent)" />
              </div>
              <div className="flex flex-col">
                <span className="text-[13px]" style={{ color: 'var(--nr-text-hi)' }}>{c.title}</span>
                <span className="text-[11px]" style={{ color: 'var(--nr-text-low)' }}>{c.sub}</span>
                <span className="nr-mono text-[10px] mt-0.5" style={{ color: 'var(--nr-accent-soft)' }}>{c.meta}</span>
              </div>
              <ArrowUpRight size={14} className="ml-auto" color="var(--nr-text-mid)" />
            </GlassCard>
          ))}
        </div>
      </div>
    </div>
  );
}
