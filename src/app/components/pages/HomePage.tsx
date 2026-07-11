import { motion } from 'motion/react';
import { ArrowUpRight, MapPin, TrendingUp, Sparkles, Clock, Users } from 'lucide-react';
import { GlassCard } from '../ui-nr/GlassCard';
import { MetricRing } from '../ui-nr/MetricRing';
import { Sparkline } from '../ui-nr/Sparkline';
import { DigitRoll } from '../ui-nr/DigitRoll';
import { WordReveal, Stagger, StaggerItem } from '../ui-nr/Reveal';
import { Ticker } from '../ui-nr/Ticker';
import { type Bar } from '../data/mock';
import { useNightRadarData, useNightRadarTicker } from '../data/runtime';
import { useState } from 'react';

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

function femaleMetricLabel(bar: Bar) {
  if (bar.genderStatus === 'unavailable') return '判定不可';
  if (bar.genderStatus === 'partial') return `${bar.femaleCount}件・参考`;
  return `${bar.femaleCount}件`;
}

export function HomePage({ onOpen, onNavigate }: { onOpen: (id: string) => void; onNavigate: (tab: 'search' | 'schedule' | 'account') => void }) {
  const { bars, events, meta } = useNightRadarData();
  const ticker = useNightRadarTicker();
  const [filter, setFilter] = useState('すべて');
  const visibleBars = bars.filter((bar) => matchesFilter(bar, filter));
  const totalFemale = bars.reduce((sum, bar) => sum + bar.femaleCount, 0);
  const currentMonthEventCount = events.filter((event) => event.date.startsWith(meta.currentMonth)).length;
  const activeRecentStores = bars.filter((bar) => bar.recentThreeHourCount > 0).length;
  const postMax = Math.max(1, ...bars.map((bar) => bar.postCount));
  const femaleMax = Math.max(1, ...bars.map((bar) => bar.femaleCount));
  const recentMax = Math.max(1, ...bars.map((bar) => bar.recentThreeHourCount));
  const topBar = bars[0];

  return (
    <div className="flex flex-col gap-7">
      {/* Ticker */}
      <Ticker items={ticker} />

      {/* Hero — measured city signal */}
      <motion.section
        className="nr-home-hero relative overflow-hidden rounded-[24px] border border-white/[0.1]"
        initial={false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease }}
      >
        <div className="nr-home-hero-image" aria-hidden="true" />
        <div className="nr-home-hero-scan" aria-hidden="true" />
        <div className="relative z-[2] grid min-h-[260px] grid-cols-1 items-end gap-4 p-5 sm:min-h-[280px] sm:gap-6 sm:p-8 lg:grid-cols-[1.35fr_0.75fr] lg:gap-10">
          <div>
          <motion.div
            className="flex items-center gap-2 mb-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, ease }}
          >
            <span className="nr-pulse" />
            <span className="nr-mono text-[11px]" style={{ color: 'var(--nr-text-mid)' }}>最終集計 · {meta.generatedAtLabel}（日本時間）</span>
          </motion.div>
          <h1 className="nr-heading text-[30px] sm:text-[42px] leading-[1.12]" style={{ color: 'var(--nr-text-hi)' }}>
            <WordReveal text="今夜の動きを、" />
            <br />
            <span style={{ color: 'var(--nr-accent-soft)' }}><WordReveal text="投稿数で見極める。" delay={0.35} /></span>
          </h1>
          <motion.p
            className="mt-4 hidden max-w-[60ch] text-[14px] leading-[1.7] sm:block"
            style={{ color: 'var(--nr-text-mid)' }}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease, delay: 0.7 }}
          >
            今日の営業時間に入った顧客投稿を集計し、店側の投稿と時刻を判定できないデータは順位から外しています。
          </motion.p>
          </div>
          <motion.div
          className="nr-hero-signal-panel flex flex-col items-start gap-2 rounded-2xl p-3 sm:p-4 lg:items-end"
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease, delay: 0.5 }}
        >
          <span className="nr-mono text-[11px]" style={{ color: 'var(--nr-accent-soft)' }}>当日顧客投稿 1位</span>
          <div className="nr-heading max-w-full text-[24px] leading-tight sm:text-[28px] lg:text-right" style={{ color: 'var(--nr-text-hi)' }}>
            {topBar?.name ?? '集計中'}
          </div>
          <div className="grid w-full grid-cols-3 gap-2 pt-2 text-left">
            <div><span>当日投稿</span><strong>{topBar?.postCount ?? 0}件</strong></div>
            <div><span>直近3時間</span><strong>{topBar?.recentThreeHourCount ?? 0}件</strong></div>
            <div><span>女性判定</span><strong>{topBar ? femaleMetricLabel(topBar) : '確認中'}</strong></div>
          </div>
          <button
            className="nr-accent-btn mt-2 flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px]"
            onClick={() => bars[0] && onOpen(bars[0].id)}
            disabled={!bars.length}
          >
            1位の集計を見る <ArrowUpRight size={14} />
          </button>
          <span className="nr-mono text-[10px]" style={{ color: 'var(--nr-text-low)' }}>{activeRecentStores}店で直近3時間に投稿あり</span>
          </motion.div>
        </div>
      </motion.section>

      {/* KPI row */}
      <Stagger delay={0.9} gap={0.08}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: '当日顧客投稿', value: meta.postCount, suffix: '件', hint: '店側投稿を除外' },
            { label: '直近3時間', value: meta.recentThreeHourCount, suffix: '件', hint: 'BBS投稿' },
            { label: '女性書き込み', value: totalFemale, suffix: '件', hint: '性別判定済み' },
            { label: '今日の予定', value: meta.todayEventCount, suffix: '件', hint: '公式URL登録済み' },
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
              <GlassCard interactive onClick={() => onOpen(b.id)} className="nr-rank-card nr-focus nr-hairline nr-sheen p-4 sm:p-5" data-rank={b.rank}>
                  <div className="grid grid-cols-1 items-center gap-5 sm:grid-cols-2 xl:grid-cols-[64px_minmax(220px,1.35fr)_repeat(3,minmax(92px,0.72fr))_minmax(170px,0.95fr)] xl:gap-4">
                    <div className="nr-rank-medal sm:col-span-2 xl:col-span-1">
                      <span>{b.rank}</span>
                      <small>RANK</small>
                    </div>
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
                        {b.tags.slice(0, 3).map(t => <span key={t} className="text-[10px]" style={{ color: 'var(--nr-text-low)' }}>{t}</span>)}
                      </div>
                    </div>
                    <MetricRing value={b.postCount} max={postMax} label="当日総書き込み" valueSuffix="件" color="var(--nr-accent)" />
                    <MetricRing value={b.femaleCount} max={femaleMax} label="女性書き込み" displayValue={femaleMetricLabel(b)} color="var(--nr-accent-2)" />
                    <MetricRing value={b.recentThreeHourCount} max={recentMax} label="直近3時間" color="var(--nr-accent-soft)" />
                    <div className="flex flex-col gap-2 items-start sm:items-end sm:col-span-2 xl:col-span-1">
                      <div className="flex items-center gap-1.5 nr-mono text-[10px]" style={{ color: 'var(--nr-text-mid)' }}>
                        <TrendingUp size={10} color="var(--nr-accent)" /> 当日顧客投稿の推移
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
            { icon: TrendingUp, title: '条件から探す', sub: '女性書き込み・直近更新・予定で絞る', meta: `${bars.length}店から検索`, tab: 'search' as const },
            { icon: Clock, title: '予定を確認する', sub: '日付と時間帯から公式予定を見る', meta: `今日 ${meta.todayEventCount}件 / 今月 ${currentMonthEventCount}件`, tab: 'schedule' as const },
            { icon: Users, title: '取得状態を見る', sub: '鮮度・投稿者名・性別・正規化率を確認', meta: `信頼度80%以上 ${meta.highConfidenceCount}店`, tab: 'account' as const },
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
