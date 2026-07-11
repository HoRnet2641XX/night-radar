import { motion } from 'motion/react';
import { MapPin, Clock, Users, ArrowUpRight, Sparkles, Info } from 'lucide-react';
import { GlassCard } from '../ui-nr/GlassCard';
import { RadarChart } from '../ui-nr/RadarChart';
import { Sparkline } from '../ui-nr/Sparkline';
import { DigitRoll } from '../ui-nr/DigitRoll';
import { WordReveal, Stagger, StaggerItem } from '../ui-nr/Reveal';
import { RADAR_KEYS, type Bar } from '../data/mock';
import { useNightRadarData } from '../data/runtime';

const ease = [0.22, 1, 0.36, 1] as const;
type BarMetricKey = Extract<keyof Bar, 'vibe' | 'drinks' | 'service' | 'music' | 'crowd'>;
const detailMetrics: Array<{
  k: BarMetricKey;
  label: string;
  color: string;
  hint: string;
  unit: string;
}> = [
  { k: 'vibe', label: '当日顧客投稿', color: 'var(--nr-accent-2)', hint: '今日の来店日として判定した顧客投稿', unit: '件' },
  { k: 'drinks', label: '女性書き込み', color: 'var(--nr-accent)', hint: '投稿者の性別を判定できた投稿から集計', unit: '件' },
  { k: 'service', label: '集計信頼度', color: 'var(--nr-accent-soft)', hint: '取得鮮度・正規化・投稿時刻・件数から算出', unit: '点' },
  { k: 'music', label: '今日の予定', color: 'var(--nr-accent-deep)', hint: '当日の登録イベント', unit: '件' },
  { k: 'crowd', label: '直近3時間', color: 'var(--nr-accent)', hint: '現在時刻から3時間以内の投稿', unit: '件' },
];

export function DetailPage({ id, onOpen }: { id: string; onOpen: (id: string) => void }) {
  const { bars } = useNightRadarData();
  const bar = bars.find(b => b.id === id) ?? bars[0];
  if (!bar) {
    return <GlassCard className="p-6 nr-hairline">表示できる店舗データがありません。</GlassCard>;
  }
  const radarValues = RADAR_KEYS.map(k => {
    const v = bar[k.key];
    return v;
  });
  const radarLabels = RADAR_KEYS.map(k => k.label);
  const others = bars
    .filter(b => b.id !== bar.id)
    .toSorted((left, right) => left.rank - right.rank)
    .slice(0, 5);
  const hourlyMax = Math.max(0, ...bar.hourly);
  const sourceLink = bar.officialUrl || bar.bbsUrl || bar.mapUrl;
  const sourceLinkLabel = bar.officialUrl
    ? '公式サイトを開く'
    : bar.bbsUrl
      ? 'BBSを開く'
      : '地図を開く';

  return (
    <div className="flex flex-col gap-8">
      {/* Hero */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-6 lg:gap-8 items-end pt-4">
        <div>
          <motion.div className="flex items-center gap-2 mb-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, ease }}>
            <span className="nr-pulse" />
            <span className="nr-mono text-[12px]" style={{ color: 'var(--nr-text-mid)' }}>店舗詳細 · 当日投稿 {bar.rank}位</span>
          </motion.div>
          <h1 className="nr-heading text-[34px] sm:text-[40px] leading-[1.15]" style={{ color: 'var(--nr-text-hi)' }}>
            <WordReveal text={bar.name} />
          </h1>
          <motion.div className="flex items-center gap-5 mt-4 text-[11px]"
            style={{ color: 'var(--nr-text-mid)' }}
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease, delay: 0.55 }}
          >
            <span className="flex items-center gap-1"><MapPin size={11} /> {bar.area}</span>
            <span className="flex items-center gap-1 nr-mono"><Clock size={11} /> {bar.businessWindowLabel} · 最多 {bar.peakHour}</span>
            <span className="flex items-center gap-1 nr-mono"><Users size={11} /> 女性 {bar.femaleCount}件 · 投稿 {bar.postCount}件 · 3h {bar.recentThreeHourCount}件</span>
          </motion.div>
          <motion.div className="flex flex-wrap gap-1.5 mt-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}
          >
            {bar.tags.map(t => <span key={t} className="nr-chip">{t}</span>)}
          </motion.div>
        </div>
        <motion.div
          className="flex flex-col items-start lg:items-end gap-2"
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

      {/* Radar + Metric grid */}
      <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-4">
        <GlassCard className="p-6 flex flex-col items-center relative overflow-hidden nr-hairline">
          <div className="nr-mono text-[12px] mb-2" style={{ color: 'var(--nr-text-mid)' }}>店舗比較指数 · 0〜100</div>
          <RadarChart values={radarValues} labels={radarLabels} size={340} color="var(--nr-accent)" />
          <div className="flex items-center gap-2 mt-2 nr-mono text-[10px]">
            <span className="w-2 h-2 rounded-full" style={{ background: 'var(--nr-accent)' }} />
            <span style={{ color: 'var(--nr-text-mid)' }}>投稿100件・直近10件・予定4件を上限100で換算</span>
            <span className="w-2 h-2 rounded-full ml-4" style={{ background: 'rgba(255,255,255,0.2)' }} />
            <span style={{ color: 'var(--nr-text-mid)' }}>{bar.dataConfidenceLabel}</span>
          </div>
          <p className="text-[12px] mt-4 text-center max-w-[320px] leading-relaxed" style={{ color: 'var(--nr-text-mid)' }}>{bar.note}</p>
        </GlassCard>

        <Stagger delay={0.15} gap={0.06}>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {detailMetrics.map((m) => {
              const val = bar[m.k];
              const displayValue = m.k === 'vibe'
                ? bar.postCount
                : m.k === 'drinks'
                  ? bar.femaleCount
                : m.k === 'music'
                  ? bar.eventCount
                  : m.k === 'crowd'
                    ? bar.recentThreeHourCount
                    : m.k === 'service'
                      ? bar.dataConfidence
                      : val;
              return (
                <StaggerItem key={m.k}>
                  <GlassCard className="p-4 flex flex-col gap-2 nr-focus nr-hairline">
                    <span className="nr-mono text-[11px]" style={{ color: 'var(--nr-text-mid)' }}>{m.label}</span>
                    <div className="flex items-baseline gap-1">
                      <span className="nr-heading text-[28px]" style={{ color: 'var(--nr-text-hi)' }}>
                        <DigitRoll value={`${displayValue}${m.unit}`} />
                      </span>
                    </div>
                    <div className="h-[3px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                      <motion.div
                        initial={{ width: 0 }} animate={{ width: `${Math.min(100, val)}%` }}
                        transition={{ duration: 1.2, ease, delay: 0.4 }}
                        style={{ height: '100%', background: m.color, boxShadow: `0 0 8px ${m.color}` }}
                      />
                    </div>
                    <span className="text-[10px]" style={{ color: 'var(--nr-text-low)' }}>{m.hint}</span>
                  </GlassCard>
                </StaggerItem>
              );
            })}
          </div>
        </Stagger>
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

      {/* Comparison list */}
      <div>
        <div className="flex items-baseline justify-between mb-4">
          <div className="flex items-baseline gap-3">
            <span className="nr-mono text-[12px]" style={{ color: 'var(--nr-text-mid)' }}>比較候補</span>
            <h2 className="nr-heading text-[22px]" style={{ color: 'var(--nr-text-hi)' }}>女性書き込み数が多い店舗</h2>
          </div>
          <span className="nr-mono text-[11px]" style={{ color: 'var(--nr-text-low)' }}>同じ集計条件で比較</span>
        </div>
        <GlassCard className="p-2 nr-hairline">
          {others.map((o, i) => {
            return (
              <motion.button key={o.id}
                type="button"
                onClick={() => onOpen(o.id)}
                initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * i, duration: 0.6, ease }}
                className="w-full text-left grid grid-cols-2 md:grid-cols-[1.6fr_repeat(4,1fr)_auto] gap-3 items-center px-4 py-4 rounded-xl hover:bg-white/[0.03] transition-colors"
              >
                <div>
                  <div className="text-[13px]" style={{ color: 'var(--nr-text-hi)' }}>{o.name}</div>
                  <div className="text-[11px]" style={{ color: 'var(--nr-text-low)' }}>{o.area}</div>
                </div>
                <div><span className="nr-mono text-[11px]" style={{ color: 'var(--nr-text-low)' }}>女性書き込み</span><br /><span className="nr-mono text-[14px]">{o.femaleCount}件</span></div>
                <div><span className="nr-mono text-[11px]" style={{ color: 'var(--nr-text-low)' }}>直近3時間</span><br /><span className="nr-mono text-[14px]">{o.recentThreeHourCount}件</span></div>
                <div><span className="nr-mono text-[11px]" style={{ color: 'var(--nr-text-low)' }}>今日の予定</span><br /><span className="nr-mono text-[14px]">{o.eventCount}件</span></div>
                <div><span className="nr-mono text-[11px]" style={{ color: 'var(--nr-text-low)' }}>集計信頼度</span><br /><span className="nr-mono text-[14px]">{o.dataConfidence}点</span></div>
                <span className="nr-chip">店舗詳細</span>
              </motion.button>
            );
          })}
        </GlassCard>
      </div>
    </div>
  );
}
