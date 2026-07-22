import {
  ArrowUpRight,
  CalendarDays,
  Clock3,
  MapPin,
  SlidersHorizontal,
  Sparkles,
  UserRoundCheck,
} from 'lucide-react';
import { useState } from 'react';
import { GlassCard } from '../ui-nr/GlassCard';
import { AudienceSignals } from '../ui-nr/AudienceSignals';
import { HeatBadge } from '../ui-nr/HeatBadge';
import { type Bar } from '../data/mock';
import { useNightRadarData } from '../data/runtime';

const QUICK_FILTERS = [
  { key: 'open', label: '今から行ける', icon: Clock3 },
  { key: 'female', label: '女性投稿あり', icon: UserRoundCheck },
  { key: 'event', label: '予定あり', icon: CalendarDays },
  { key: 'first', label: '初めて向け', icon: Sparkles },
] as const;

type QuickFilterKey = (typeof QUICK_FILTERS)[number]['key'];

function matchesFilter(bar: Bar, filter: QuickFilterKey | null) {
  if (filter === 'open') return bar.isWithinBusinessHours;
  if (filter === 'female') return bar.femaleCount > 0;
  if (filter === 'event') return bar.eventCount > 0;
  if (filter === 'first') return bar.firstVisitCount > 0;
  return true;
}

function eventMetricLabel(bar: Bar) {
  if (bar.eventStatus === 'external') return '公式確認';
  if (bar.eventStatus === 'unverified') return '未確認';
  return `${bar.eventCount}件`;
}

function femaleShareOfTotal(bar: Bar) {
  return bar.postCount > 0 ? Math.min(100, Math.round((bar.femaleCount / bar.postCount) * 100)) : 0;
}

function decisionReason(bar: Bar) {
  if (bar.recentThreeHourCount > 0 && bar.eventCount > 0) {
    return `直近3時間に${bar.recentThreeHourCount}件、今日の予定も確認済み`;
  }
  if (bar.recentThreeHourCount > 0) {
    return `直近3時間に${bar.recentThreeHourCount}件、いま投稿が動いています`;
  }
  if (bar.eventCount > 0) {
    return `今日の予定${bar.eventCount}件、当日投稿と合わせて確認`;
  }
  return `当日顧客投稿${bar.postCount}件で現在の上位候補`;
}

function CandidateCard({
  bar,
  index,
  onOpen,
}: {
  bar: Bar;
  index: number;
  onOpen: (id: string) => void;
}) {
  const roleLabel = index === 0 ? '今日行くならここ' : index === 1 ? '迷うなら比較' : 'もう1つの候補';

  return (
    <article
      className="nr-decision-card"
      data-primary={index === 0}
    >
      <header className="nr-decision-card-header">
        <div>
          <span>{roleLabel}</span>
          <small>当日顧客投稿 {bar.rank}位</small>
        </div>
        <HeatBadge rank={bar.rank} large={index === 0} />
      </header>

      <div className="nr-decision-store">
        <div>
          <h2>{bar.name}</h2>
          <p><MapPin size={12} aria-hidden="true" />{bar.area}<span aria-hidden="true">·</span>{bar.businessStatusLabel}</p>
        </div>
        <p className="nr-decision-reason">{decisionReason(bar)}</p>
      </div>

      <dl className="nr-decision-metrics">
        <div><dt>当日投稿</dt><dd>{bar.postCount}<small>件</small></dd></div>
        <div><dt>直近3時間</dt><dd>{bar.recentThreeHourCount}<small>件</small></dd></div>
        <div><dt>今日の予定</dt><dd>{eventMetricLabel(bar)}</dd></div>
      </dl>

      <AudienceSignals
        compact
        counts={{ male: bar.maleCount, female: bar.femaleCount, couple: bar.coupleCount, unknown: bar.genderUnknownCount }}
        includeUnknown
        total={bar.postCount}
        showFemaleRate
        label={`${bar.name}の当日顧客投稿の区分`}
      />

      <footer className="nr-decision-card-footer">
        <span className="nr-freshness" data-reliability={bar.reliability}>
          <i aria-hidden="true" />{bar.freshnessLabel} · {bar.dataConfidenceLabel}
        </span>
        <button type="button" className={index === 0 ? 'nr-accent-btn' : 'nr-secondary-btn'} onClick={() => onOpen(bar.id)}>
          店舗詳細を見る <ArrowUpRight size={14} aria-hidden="true" />
        </button>
      </footer>
    </article>
  );
}

export function HomePage({
  onOpen,
  onNavigate,
}: {
  onOpen: (id: string) => void;
  onNavigate: (tab: 'search' | 'schedule' | 'account') => void;
}) {
  const { bars, meta } = useNightRadarData();
  const [filter, setFilter] = useState<QuickFilterKey | null>(null);
  const visibleBars = bars.filter((bar) => matchesFilter(bar, filter));
  const candidates = visibleBars.slice(0, 3);
  const topBar = bars[0];
  const businessDateLabel = meta.todayKey.slice(5).replace('-', '/');
  const activeFilter = QUICK_FILTERS.find((item) => item.key === filter);

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <section className="nr-home-hero relative overflow-hidden rounded-[24px] border border-white/[0.1]" aria-labelledby="home-hero-title">
        <div className="nr-home-hero-image" aria-hidden="true" />
        <div className="nr-home-hero-scan" aria-hidden="true" />
        <div className="relative z-[2] grid min-h-[260px] grid-cols-1 items-end gap-4 p-5 sm:min-h-[280px] sm:gap-6 sm:p-8 lg:grid-cols-[1.35fr_0.75fr] lg:gap-10">
          <div>
            <div className="mb-4 flex items-center gap-2">
              <span className="nr-pulse" aria-hidden="true" />
              <span className="nr-mono text-[11px]" style={{ color: 'var(--nr-text-mid)' }}>
                営業日 {businessDateLabel} · 最終集計 {meta.generatedAtLabel}（日本時間）
              </span>
            </div>
            <h1 id="home-hero-title" className="nr-heading text-[28px] leading-[1.18] sm:text-[36px]" style={{ color: 'var(--nr-text-hi)' }}>
              今日の行き先を、<br />
              <span style={{ color: 'var(--nr-accent-soft)' }}>投稿数で見極める。</span>
            </h1>
            <p className="mt-4 hidden max-w-[60ch] text-[14px] leading-[1.7] sm:block" style={{ color: 'var(--nr-text-mid)' }}>
              当営業日の顧客投稿を集計し、店側の投稿と時刻を判定できないデータは順位から外しています。
            </p>
          </div>

          <aside data-tour="today-hero" className="nr-hero-signal-panel flex flex-col items-start gap-2 rounded-2xl p-3 sm:p-4 lg:items-end" aria-label="当日顧客投稿1位">
            <div className="flex flex-wrap items-center gap-2">
              <span className="nr-mono text-[11px]" style={{ color: 'var(--nr-accent-soft)' }}>当日顧客投稿 1位</span>
              {topBar ? <HeatBadge rank={topBar.rank} /> : null}
            </div>
            <h2 className="nr-heading max-w-full text-[22px] leading-[1.25] sm:text-[26px] lg:text-right" style={{ color: 'var(--nr-text-hi)' }}>
              {topBar?.name ?? '集計中'}
            </h2>
            <div className="grid w-full grid-cols-3 gap-2 pt-2 text-left">
              <div><span className="nr-hero-metric-label">当日投稿</span><strong>{topBar?.postCount ?? 0}件</strong></div>
              <div><span className="nr-hero-metric-label">直近3時間</span><strong>{topBar?.recentThreeHourCount ?? 0}件</strong></div>
              <div>
                <span className="nr-hero-metric-label"><i aria-hidden="true">💗</i>女性率</span>
                <strong>{topBar ? femaleShareOfTotal(topBar) : 0}%</strong>
                <small className="nr-hero-metric-note">女性 {topBar?.femaleCount ?? 0} / 全 {topBar?.postCount ?? 0}</small>
              </div>
            </div>
            <button
              type="button"
              className="nr-accent-btn mt-2 flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px]"
              onClick={() => topBar && onOpen(topBar.id)}
              disabled={!topBar}
            >
              1位の集計を見る <ArrowUpRight size={14} aria-hidden="true" />
            </button>
            <span className="nr-mono text-[10px]" style={{ color: 'var(--nr-text-low)' }}>
              {topBar ? `${topBar.freshnessLabel} · ${topBar.dataConfidenceLabel}` : 'データを取得中'}
            </span>
          </aside>
        </div>
      </section>

      <section data-tour="top-candidates" className="nr-decision-board" aria-labelledby="today-decision-title">
        <header className="nr-decision-board-header">
          <div>
            <span className="nr-decision-kicker">営業日 {businessDateLabel} · 最終集計 {meta.generatedAtLabel}</span>
            <h2 id="today-decision-title">今日の候補を、3店までに絞る</h2>
            <p>当日顧客投稿を基準に、直近3時間と今日の予定を添えて比較します。</p>
          </div>
          <div className="nr-source-status" aria-label={`取得状態: ${meta.sourceCount}店舗中${meta.freshCount}店舗が新鮮`}>
            <span><i aria-hidden="true" />取得状態</span>
            <strong>{meta.freshCount}<small> / {meta.sourceCount}店舗</small></strong>
            <em>新しいデータ</em>
          </div>
        </header>

        {candidates.length > 0 ? (
          <div className="nr-decision-grid">
            {candidates.map((bar, index) => (
              <CandidateCard key={bar.id} bar={bar} index={index} onOpen={onOpen} />
            ))}
          </div>
        ) : (
          <GlassCard className="nr-decision-empty p-6">
            <strong>この条件に合う店舗はありません</strong>
            <span>条件を外すか、詳しい条件から探してください。</span>
            <button type="button" className="nr-secondary-btn" onClick={() => setFilter(null)}>条件を外す</button>
          </GlassCard>
        )}

        <div className="nr-decision-basis">
          <strong>順位の基準</strong>
          <span>当日顧客投稿</span>
          <span>店側投稿は除外</span>
          <span>時刻を判定できる投稿のみ</span>
        </div>
      </section>

      <section data-tour="quick-filters" className="nr-quick-filter" aria-labelledby="quick-filter-title">
        <div>
          <span className="nr-mono">条件を変える</span>
          <h2 id="quick-filter-title">今夜の優先条件</h2>
          <p>{activeFilter ? `「${activeFilter.label}」に合う上位3店を表示中です。` : '条件を1つ選ぶと、候補3店だけが入れ替わります。'}</p>
        </div>
        <div className="nr-quick-filter-actions">
          <div className="nr-quick-filter-chips" aria-label="簡易条件">
            {QUICK_FILTERS.map((item) => {
              const Icon = item.icon;
              const active = filter === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  className="nr-quick-filter-chip"
                  data-active={active}
                  aria-pressed={active}
                  onClick={() => setFilter(active ? null : item.key)}
                >
                  <Icon size={14} aria-hidden="true" />{item.label}
                </button>
              );
            })}
          </div>
          <button type="button" className="nr-secondary-btn nr-advanced-search" onClick={() => onNavigate('search')}>
            <SlidersHorizontal size={14} aria-hidden="true" />詳しい条件から探す
          </button>
        </div>
      </section>
    </div>
  );
}
