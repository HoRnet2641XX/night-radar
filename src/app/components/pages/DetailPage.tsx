import { motion } from 'motion/react';
import { MapPin, Clock, Users, ArrowUpRight, Sparkles, Info, CalendarDays, ChevronsUpDown, X, Phone, WalletCards, Navigation, BookmarkCheck, BookmarkPlus } from 'lucide-react';
import { GlassCard } from '../ui-nr/GlassCard';
import { RadarChart } from '../ui-nr/RadarChart';
import { Sparkline } from '../ui-nr/Sparkline';
import { DigitRoll } from '../ui-nr/DigitRoll';
import { WordReveal, Stagger, StaggerItem } from '../ui-nr/Reveal';
import { RADAR_KEYS, type Bar } from '../data/mock';
import { useNightRadarData } from '../data/runtime';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocalPreferences } from '../data/local-preferences';

const ease = [0.22, 1, 0.36, 1] as const;
type BarMetricKey = Extract<keyof Bar, 'vibe' | 'drinks' | 'service' | 'music' | 'crowd'>;
const detailMetrics: Array<{
  k: BarMetricKey;
  label: string;
  color: string;
  hint: string;
}> = [
  { k: 'vibe', label: '当日顧客投稿', color: 'var(--nr-accent-2)', hint: '今日の来店日として判定した顧客投稿' },
  { k: 'drinks', label: '女性書き込み', color: 'var(--nr-accent)', hint: '投稿者の性別を判定できた投稿から集計' },
  { k: 'service', label: '集計信頼度', color: 'var(--nr-accent-soft)', hint: '取得鮮度・正規化・投稿時刻・件数から算出' },
  { k: 'music', label: '今日の予定', color: 'var(--nr-accent-deep)', hint: '当日の登録イベント' },
  { k: 'crowd', label: '直近3時間', color: 'var(--nr-accent)', hint: '現在時刻から3時間以内の投稿' },
];

function femaleMetricLabel(bar: Bar) {
  if (bar.genderStatus === 'unavailable') return '判定不可';
  if (bar.genderStatus === 'partial') return `${bar.femaleCount}件・参考`;
  return `${bar.femaleCount}件`;
}

export function DetailPage({ id, onOpen }: { id: string; onOpen: (id: string) => void }) {
  const { bars, events, meta } = useNightRadarData();
  const { candidateStoreIds, toggleCandidateStore } = useLocalPreferences();
  const [compareId, setCompareId] = useState('');
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const bar = bars.find(b => b.id === id) ?? bars[0];
  const barId = bar?.id ?? '';
  const others = useMemo(() => bars
    .filter(b => b.id !== barId)
    .toSorted((left, right) => {
      const leftUnavailable = left.genderStatus === 'unavailable' ? 1 : 0;
      const rightUnavailable = right.genderStatus === 'unavailable' ? 1 : 0;
      return leftUnavailable - rightUnavailable || right.femaleCount - left.femaleCount || left.rank - right.rank;
    })
    .slice(0, 8), [barId, bars]);
  const comparedBar = others.find((item) => item.id === compareId) ?? others[0];

  useEffect(() => {
    if (!compareModalOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCompareModalOpen(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [compareModalOpen]);

  if (!bar) {
    return <GlassCard className="p-6 nr-hairline">表示できる店舗データがありません。</GlassCard>;
  }

  const radarValues = RADAR_KEYS.map(k => bar[k.key]);
  const radarLabels = RADAR_KEYS.map(k => k.label);
  const comparisonValues = comparedBar ? RADAR_KEYS.map((key) => comparedBar[key.key]) : undefined;
  const todayEvents = events.filter((event) => event.storeId === bar.id && event.date === meta.todayKey);
  const hourlyMax = Math.max(0, ...bar.hourly);
  const sourceLink = bar.officialUrl || bar.bbsUrl || bar.mapUrl;
  const sourceLinkLabel = bar.officialUrl
    ? '公式サイトを開く'
    : bar.bbsUrl
      ? 'BBSを開く'
      : '地図を開く';
  const isCandidate = candidateStoreIds.includes(bar.id);

  return (
    <div className="flex flex-col gap-8">
      {/* Hero */}
      <div className="nr-detail-hero grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-6 lg:gap-8 items-end pt-4">
        <div>
          <motion.div className="flex items-center gap-2 mb-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, ease }}>
            <span className="nr-pulse" />
            <span className="nr-mono text-[12px]" style={{ color: 'var(--nr-text-mid)' }}>店舗詳細 · 当日投稿 {bar.rank}位</span>
          </motion.div>
          <h1 className="nr-heading text-[34px] sm:text-[40px] leading-[1.15]" style={{ color: 'var(--nr-text-hi)' }}>
            <WordReveal text={bar.name} />
          </h1>
          <motion.div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-4 text-[11px]"
            style={{ color: 'var(--nr-text-mid)' }}
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease, delay: 0.55 }}
          >
            <span className="flex items-center gap-1"><MapPin size={11} /> {bar.area}</span>
            <span className="flex items-center gap-1 nr-mono"><Clock size={11} /> {bar.businessWindowLabel} · 最多 {bar.peakHour}</span>
            <span className="flex items-center gap-1 nr-mono"><Users size={11} /> 女性 {femaleMetricLabel(bar)} · 総投稿 {bar.postCount}件 · 3h {bar.recentThreeHourCount}件</span>
          </motion.div>
          <motion.div className="flex flex-wrap gap-1.5 mt-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}
          >
            {bar.tags.map(t => <span key={t} className="nr-chip">{t}</span>)}
          </motion.div>
        </div>
        <motion.div
          className="nr-detail-total flex flex-col items-start lg:items-end gap-2"
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease, delay: 0.4 }}
        >
          <span className="nr-mono text-[12px]" style={{ color: 'var(--nr-text-mid)' }}>当日顧客投稿</span>
          <div className="nr-heading text-[56px] sm:text-[64px] leading-none" style={{ color: 'var(--nr-accent)' }}>
            <DigitRoll value={`${bar.postCount}件`} delay={0.55} />
          </div>
          <span className="nr-mono px-2 py-0.5 rounded-full text-[10px] flex items-center gap-1 nr-delta-up">
            <Sparkles size={11} />当日投稿 {bar.rank}位 · 直近3時間 {bar.recentThreeHourCount}件
          </span>
          {sourceLink ? (
            <a href={sourceLink} target="_blank" rel="noreferrer" className="nr-accent-btn rounded-full px-4 py-2 text-[13px] flex items-center gap-1.5 mt-1">
              {sourceLinkLabel} <ArrowUpRight size={14} />
            </a>
          ) : (
            <button disabled className="nr-accent-btn rounded-full px-4 py-2 text-[13px] flex items-center gap-1.5 mt-1">店舗情報は未登録</button>
          )}
          <button type="button" className="nr-secondary-btn flex items-center gap-1.5" data-active={isCandidate} aria-pressed={isCandidate} onClick={() => toggleCandidateStore(bar.id)}>
            {isCandidate ? <BookmarkCheck size={14} /> : <BookmarkPlus size={14} />}
            {isCandidate ? '候補から外す' : 'この端末の候補に保存'}
          </button>
        </motion.div>
      </div>

      {/* Insight callout */}
      <motion.div
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease, delay: 0.9 }}
      >
        <GlassCard className="p-5 flex flex-col md:flex-row md:items-center gap-4 nr-hairline">
          <div className="w-9 h-9 rounded-xl grid place-items-center shrink-0" style={{ background: 'rgba(255,106,91,0.14)', border: '1px solid rgba(255,106,91,0.3)' }}>
            <Sparkles size={16} color="var(--nr-accent)" />
          </div>
          <div className="flex-1">
            <div className="nr-mono text-[12px]" style={{ color: 'var(--nr-accent-soft)' }}>確認できた事実</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2">
              {bar.reason.split(' / ').map((reason) => (
                <span key={reason} className="text-[12px] leading-relaxed" style={{ color: 'var(--nr-text-hi)' }}>・{reason}</span>
              ))}
            </div>
          </div>
          <div className="nr-mono text-[11px] flex items-center gap-1 md:max-w-[280px]" style={{ color: 'var(--nr-text-mid)' }}>
            <Info size={11} /> 時刻解析 {bar.timestampCoverage}% · 解析保留 {bar.excludedUntimestampedCount}件は順位に不使用 · 性別判定 {bar.genderCoverage}%
          </div>
        </GlassCard>
      </motion.div>

      <GlassCard className="nr-hairline p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="nr-mono text-[11px]" style={{ color: 'var(--nr-accent-soft)' }}>店舗情報</div>
            <h2 className="nr-heading mt-1 text-[20px]" style={{ color: 'var(--nr-text-hi)' }}>行く前の確認</h2>
          </div>
          <span className="text-[10px]" style={{ color: 'var(--nr-text-low)' }}>料金・営業内容は変更される場合があります。来店前に公式情報をご確認ください。</span>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
            <span className="nr-mono flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--nr-text-low)' }}><Navigation size={11} /> アクセス</span>
            <strong className="mt-1.5 block text-[12px] leading-relaxed" style={{ color: 'var(--nr-text-hi)' }}>{bar.nearestStation || bar.area}</strong>
            {bar.address && <span className="mt-1 block text-[10px] leading-relaxed" style={{ color: 'var(--nr-text-mid)' }}>{bar.address}</span>}
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
            <span className="nr-mono flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--nr-text-low)' }}><WalletCards size={11} /> 料金目安</span>
            <strong className="mt-1.5 block text-[12px] leading-relaxed" style={{ color: 'var(--nr-text-hi)' }}>{bar.priceNote || '公式情報を確認中'}</strong>
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
            <span className="nr-mono flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--nr-text-low)' }}><Phone size={11} /> 電話</span>
            {bar.phone
              ? <a href={`tel:${bar.phone.replace(/[^0-9+]/g, '')}`} className="mt-1.5 block text-[13px] font-semibold" style={{ color: 'var(--nr-text-hi)' }}>{bar.phone}</a>
              : <strong className="mt-1.5 block text-[12px]" style={{ color: 'var(--nr-text-mid)' }}>公式情報を確認中</strong>}
          </div>
          <div className="flex min-h-[88px] flex-col gap-2 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
            {bar.officialUrl && <a href={bar.officialUrl} target="_blank" rel="noreferrer" className="nr-secondary-btn flex w-full items-center justify-between">公式サイト <ArrowUpRight size={13} /></a>}
            {bar.mapUrl && <a href={bar.mapUrl} target="_blank" rel="noreferrer" className="nr-secondary-btn flex w-full items-center justify-between">地図を開く <ArrowUpRight size={13} /></a>}
          </div>
        </div>
      </GlassCard>

      {/* Radar, facts and comparison */}
      <button type="button" className="nr-secondary-btn flex w-full items-center justify-between xl:hidden" onClick={() => setCompareModalOpen(true)}>
        <span><span className="block text-[10px]" style={{ color: 'var(--nr-text-low)' }}>比較中</span>{comparedBar?.name ?? '比較店舗を選ぶ'}</span>
        <span className="flex items-center gap-1"><ChevronsUpDown size={14} /> 比較店舗を選ぶ</span>
      </button>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(300px,0.9fr)_minmax(0,1fr)]">
            <GlassCard className="nr-hairline relative flex min-w-0 flex-col items-center overflow-hidden p-5">
              <div className="nr-mono mb-1 text-[11px]" style={{ color: 'var(--nr-text-mid)' }}>当日の店舗比較指数 · 0〜100</div>
              <RadarChart values={radarValues} comparisonValues={comparisonValues} labels={radarLabels} size={330} color="var(--nr-accent)" />
              <div className="mt-1 flex flex-wrap justify-center gap-x-4 gap-y-2 nr-mono text-[10px]">
                <span className="flex items-center gap-1.5" style={{ color: 'var(--nr-text-mid)' }}><i className="h-0.5 w-5" style={{ background: 'var(--nr-accent)' }} />{bar.name}</span>
                {comparedBar && <span className="flex items-center gap-1.5" style={{ color: 'var(--nr-text-mid)' }}><i className="h-0 w-5 border-t border-dashed border-[#9BC9E8]" />{comparedBar.name}</span>}
              </div>
              <p className="mt-4 max-w-[360px] text-center text-[11px] leading-relaxed" style={{ color: 'var(--nr-text-low)' }}>
                投稿・直近3時間・予定は当日の最大店舗を100として換算。女性比率と集計信頼度は実測値です。件数そのものに上限はありません。
              </p>
            </GlassCard>

            <Stagger delay={0.15} gap={0.06}>
              <div className="grid h-full grid-cols-2 gap-3">
                {detailMetrics.map((m) => {
                  const val = bar[m.k];
                  const displayValue = m.k === 'vibe'
                    ? `${bar.postCount}件`
                    : m.k === 'drinks'
                      ? femaleMetricLabel(bar)
                      : m.k === 'music'
                        ? bar.eventStatus === 'unverified' ? '未確認' : `${bar.eventCount}件`
                        : m.k === 'crowd'
                          ? `${bar.recentThreeHourCount}件`
                          : `${bar.dataConfidence}点`;
                  return (
                    <StaggerItem key={m.k}>
                      <GlassCard className="nr-focus nr-hairline flex h-full min-h-[128px] flex-col gap-2 p-4">
                        <span className="nr-mono text-[11px]" style={{ color: 'var(--nr-text-mid)' }}>{m.label}</span>
                        <span className="nr-heading text-[24px] sm:text-[28px]" style={{ color: 'var(--nr-text-hi)' }}><DigitRoll value={displayValue} /></span>
                        <div className="h-[3px] overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                          <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, val)}%` }} transition={{ duration: 1.2, ease, delay: 0.4 }} style={{ height: '100%', background: m.color }} />
                        </div>
                        <span className="text-[10px] leading-relaxed" style={{ color: 'var(--nr-text-low)' }}>{m.hint}</span>
                      </GlassCard>
                    </StaggerItem>
                  );
                })}
              </div>
            </Stagger>
          </div>

          <GlassCard className="nr-hairline p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="nr-mono flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--nr-text-mid)' }}><CalendarDays size={12} /> 店舗イベント</div>
                <h3 className="nr-heading mt-1 text-[19px]" style={{ color: 'var(--nr-text-hi)' }}>今日の予定 {todayEvents.length}件</h3>
              </div>
              {bar.officialUrl && <a href={bar.officialUrl} target="_blank" rel="noreferrer" className="nr-chip">公式で確認 <ArrowUpRight size={11} /></a>}
            </div>
            {todayEvents.length ? (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {todayEvents.map((event) => (
                  <a key={event.id} href={event.sourceUrl || bar.officialUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3 transition-colors hover:bg-white/[0.05]">
                    <span className="nr-mono text-[10px]" style={{ color: 'var(--nr-accent-soft)' }}>{event.startsAt ? `${event.startsAt} · ` : ''}{event.session === 'day' ? '朝・昼' : '夜'} · {event.tag}</span>
                    <span className="mt-1 block text-[13px] leading-relaxed" style={{ color: 'var(--nr-text-hi)' }}>{event.title}</span>
                  </a>
                ))}
              </div>
            ) : <p className="mt-4 text-[12px]" style={{ color: 'var(--nr-text-low)' }}>{bar.eventStatus === 'unverified' ? 'この店舗の公式予定は未確認です。予定なしとは判定していません。' : '今日の公式イベントはありません。'}</p>}
          </GlassCard>
        </div>

        <aside className="hidden xl:block">
          <GlassCard className="nr-hairline sticky top-5 p-3">
            <div className="px-2 pb-3 pt-1">
              <div className="nr-mono text-[10px]" style={{ color: 'var(--nr-accent-soft)' }}>比較候補</div>
              <h2 className="nr-heading mt-1 text-[17px]" style={{ color: 'var(--nr-text-hi)' }}>女性書き込み数が多い店舗</h2>
              <p className="mt-1 text-[10px] leading-relaxed" style={{ color: 'var(--nr-text-low)' }}>選ぶとレーダーへ点線で重ねます。判定率が低い店舗は参考値です。</p>
            </div>
            <div className="grid max-h-[560px] gap-1 overflow-y-auto pr-1">
              {others.map((item, index) => (
                <button key={item.id} type="button" className="nr-compare-option" data-active={comparedBar?.id === item.id} onClick={() => setCompareId(item.id)}>
                  <span className="nr-compare-rank">{index + 1}</span>
                  <span className="min-w-0 flex-1"><strong>{item.name}</strong><small>総投稿 {item.postCount}件 · 判定 {item.genderCoverage}%</small></span>
                  <span className="text-right"><strong>{femaleMetricLabel(item)}</strong><small>女性</small></span>
                </button>
              ))}
            </div>
            {comparedBar && <button type="button" className="nr-secondary-btn mt-3 flex w-full" onClick={() => onOpen(comparedBar.id)}>{comparedBar.name}の詳細を開く</button>}
          </GlassCard>
        </aside>
      </div>

      {/* Hourly heatmap + trend */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-4">
        <GlassCard className="p-5 nr-hairline">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="nr-mono text-[11px]" style={{ color: 'var(--nr-text-mid)' }}>時間帯別の投稿</div>
              <h3 className="nr-heading text-[20px] mt-1" style={{ color: 'var(--nr-text-hi)' }}>当日顧客投稿があった時間</h3>
            </div>
            <span className="nr-chip nr-mono">最多 {hourlyMax > 0 ? bar.peakHour : '未判定'}</span>
          </div>
          <div className="flex items-end gap-1.5 h-40">
            {bar.hourly.map((value, i) => {
              const peak = hourlyMax > 0 && value === hourlyMax;
              const height = hourlyMax > 0 ? Math.max(4, (value / hourlyMax) * 100) : 4;
              return (
                <motion.div key={i}
                  initial={{ height: 0, opacity: 0 }} animate={{ height: `${height}%`, opacity: value > 0 ? 1 : 0.28 }}
                  transition={{ delay: 0.15 + i * 0.04, duration: 0.9, ease }}
                  className="flex-1 rounded-t-md relative group"
                  style={{
                    background: `linear-gradient(180deg, ${peak ? 'var(--nr-accent)' : `rgba(255,106,91,${0.15 + height / 200})`}, transparent)`,
                    border: `1px solid ${peak ? 'var(--nr-accent)' : 'rgba(255,106,91,0.18)'}`,
                    boxShadow: peak ? '0 0 14px var(--nr-accent-glow)' : 'none',
                  }}
                >
                  <span className="absolute -top-5 left-1/2 -translate-x-1/2 nr-mono text-[9px] opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--nr-text-hi)' }}>{value}件</span>
                </motion.div>
              );
            })}
          </div>
          <div className="flex justify-between mt-2 nr-mono text-[9px]" style={{ color: 'var(--nr-text-low)' }}>
            {bar.hourLabels.map(h => <span key={h}>{h}</span>)}
          </div>
          <div className="mt-4 text-[11px] flex items-center gap-1.5" style={{ color: 'var(--nr-text-mid)' }}>
            <Info size={11} color="var(--nr-accent)" />
            {hourlyMax > 0 ? <>最多投稿: <span className="nr-mono" style={{ color: 'var(--nr-text-hi)' }}>{bar.peakHour}</span>（{hourlyMax}件を確認）</> : '投稿時刻を判定できるデータがありません。'}
          </div>
        </GlassCard>

        <GlassCard className="p-5 flex flex-col gap-3 nr-hairline">
          <div className="nr-mono text-[12px]" style={{ color: 'var(--nr-text-mid)' }}>当日顧客投稿の推移</div>
          <h3 className="nr-heading text-[20px]" style={{ color: 'var(--nr-text-hi)' }}>投稿数の時間変化</h3>
          <div className="flex-1 flex items-end">
            <Sparkline data={bar.trend} w={360} h={140} color="var(--nr-accent)" />
          </div>
          <div className="grid grid-cols-3 gap-2 nr-mono text-[10px]" style={{ color: 'var(--nr-text-low)' }}>
            <div>{bar.hourLabels[0]}:00<br /><span style={{ color: 'var(--nr-text-hi)' }}>{bar.hourly[0]}件</span></div>
            <div>{bar.hourLabels[Math.floor(bar.hourLabels.length / 2)]}:00<br /><span style={{ color: 'var(--nr-text-hi)' }}>{bar.hourly[Math.floor(bar.hourly.length / 2)]}件</span></div>
            <div>{bar.hourLabels.at(-1)}:00<br /><span style={{ color: 'var(--nr-text-hi)' }}>{bar.hourly.at(-1)}件</span></div>
          </div>
        </GlassCard>
      </div>

      {compareModalOpen && typeof document !== 'undefined' && createPortal((
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm xl:hidden" role="presentation" onMouseDown={() => setCompareModalOpen(false)}>
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="compare-store-title"
            className="nr-modal-panel flex max-h-[min(82dvh,720px)] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl"
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/[0.08] p-5">
              <div>
                <span className="nr-mono text-[10px]" style={{ color: 'var(--nr-accent-soft)' }}>レーダー比較</span>
                <h2 id="compare-store-title" className="nr-heading mt-1 text-[20px]" style={{ color: 'var(--nr-text-hi)' }}>比較する店舗を選ぶ</h2>
                <p className="mt-1 text-[11px]" style={{ color: 'var(--nr-text-low)' }}>女性書き込み数の多い順です。未判定が多い店舗は参考表示になります。</p>
              </div>
              <button type="button" className="nr-chip grid !p-2 place-items-center" aria-label="閉じる" onClick={() => setCompareModalOpen(false)}><X size={16} /></button>
            </div>
            <div className="grid gap-2 overflow-y-auto p-3">
              {others.map((item, index) => (
                <button key={item.id} type="button" className="nr-compare-option" data-active={comparedBar?.id === item.id} onClick={() => { setCompareId(item.id); setCompareModalOpen(false); }}>
                  <span className="nr-compare-rank">{index + 1}</span>
                  <span className="min-w-0 flex-1"><strong>{item.name}</strong><small>総投稿 {item.postCount}件 · 性別判定 {item.genderCoverage}%</small></span>
                  <span className="text-right"><strong>{femaleMetricLabel(item)}</strong><small>女性</small></span>
                </button>
              ))}
            </div>
          </motion.div>
        </div>
      ), document.body)}
    </div>
  );
}
