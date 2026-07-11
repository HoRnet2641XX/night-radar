import { motion } from 'motion/react';
import { Search, X, MapPin, Activity } from 'lucide-react';
import { GlassCard } from '../ui-nr/GlassCard';
import { WordReveal } from '../ui-nr/Reveal';
import { BARS, type Bar } from '../data/mock';
import { useState } from 'react';

const CATEGORIES = ['すべて', '営業時間内', '直近3時間', '女性書き込みあり', '初回来店の記述', '複数来店の記述', '予定あり', '集計信頼度80点以上'];
const ease = [0.22, 1, 0.36, 1] as const;

function matchesCategory(bar: Bar, category: string) {
  if (category === '女性書き込みあり') return bar.femaleCount > 0;
  if (category === '営業時間内') return bar.isWithinBusinessHours;
  if (category === '直近3時間') return bar.recentThreeHourCount > 0;
  if (category === '初回来店の記述') return bar.firstVisitCount > 0;
  if (category === '複数来店の記述') return bar.groupCount > 0;
  if (category === '予定あり') return bar.eventCount > 0;
  if (category === '集計信頼度80点以上') return bar.dataConfidence >= 80;
  return true;
}

export function SearchPage({ onOpen }: { onOpen: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('すべて');
  const normalizedQuery = q.trim().toLocaleLowerCase('ja-JP');
  const filtered = BARS.filter((bar) => {
    const matchesQuery = !normalizedQuery || [bar.name, bar.area, ...bar.tags]
      .some((value) => value.toLocaleLowerCase('ja-JP').includes(normalizedQuery));
    return matchesQuery && matchesCategory(bar, category);
  }).toSorted((left, right) =>
    category === '女性書き込みあり'
      ? right.femaleCount - left.femaleCount || left.rank - right.rank
      : left.rank - right.rank,
  );
  return (
    <div className="flex flex-col gap-8">
      <div className="pt-4">
        <motion.div className="flex items-center gap-2 mb-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, ease }}>
          <span className="nr-pulse" />
          <span className="nr-mono text-[12px]" style={{ color: 'var(--nr-text-mid)' }}>店舗を探す</span>
        </motion.div>
        <h1 className="nr-heading text-[34px] sm:text-[40px] leading-[1.15]" style={{ color: 'var(--nr-text-hi)' }}>
          <WordReveal text="行く条件に合う店舗を" />
          <br />
          <WordReveal text="絞り込む。" delay={0.3} />
        </h1>
        <motion.p className="text-[14px] mt-4 max-w-[60ch] leading-[1.7]" style={{ color: 'var(--nr-text-mid)' }}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease, delay: 0.6 }}>
          店名と、女性書き込み、直近3時間の投稿、初回来店・複数来店の記述、今日の予定から絞り込みます。
        </motion.p>
      </div>

      {/* Search bar */}
      <GlassCard className="p-2 pl-4 flex items-center gap-3 nr-hairline">
        <Search size={16} color="var(--nr-text-mid)" />
        <input
          value={q} onChange={e => setQ(e.target.value)}
          name="store-search"
          aria-label="店舗を検索"
          autoComplete="off"
          placeholder="店名・エリア・特徴で検索…"
          className="bg-transparent flex-1 text-[14px] py-2 focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ color: 'var(--nr-text-hi)' }}
        />
        {q && (
          <button type="button" aria-label="検索語を消す" onClick={() => setQ('')} className="nr-chip grid place-items-center !p-2">
            <X size={14} />
          </button>
        )}
      </GlassCard>
      <p className="text-[12px] -mt-5" style={{ color: 'var(--nr-text-low)' }}>入力内容はすぐ検索結果に反映されます。</p>

      {/* Facets */}
      <div>
        <GlassCard className="p-4 nr-hairline">
          <div className="nr-mono text-[12px] mb-3" style={{ color: 'var(--nr-text-mid)' }}>条件</div>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((item) => (
              <button key={item} type="button" className="nr-chip" data-active={category === item} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>
            ))}
          </div>
        </GlassCard>
      </div>

      {/* Result list */}
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-3">
          <span className="nr-mono text-[12px]" style={{ color: 'var(--nr-text-mid)' }}>検索結果</span>
          <h2 className="nr-heading text-[22px]" style={{ color: 'var(--nr-text-hi)' }}>該当 <span style={{ color: 'var(--nr-accent)' }}>{filtered.length}</span> 件</h2>
        </div>
        <span className="nr-mono text-[10px]" style={{ color: 'var(--nr-text-low)' }}>
          並び順 · {category === '女性書き込みあり' ? '女性書き込み' : '当日営業分の顧客投稿'}
        </span>
      </div>

      <GlassCard className="p-2 nr-hairline">
        {filtered.map((b, i) => {
          return (
            <motion.button key={b.id}
              type="button"
              initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05, duration: 0.6, ease }}
              onClick={() => onOpen(b.id)}
              className="w-full text-left grid grid-cols-2 md:grid-cols-[auto_1.6fr_1fr_1fr_1fr_auto_auto] gap-3 md:gap-4 items-center px-4 py-4 rounded-xl hover:bg-white/[0.04] cursor-pointer transition-colors"
            >
              <span className="nr-mono text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1" style={{ background: 'rgba(255,106,91,0.10)', color: 'var(--nr-accent-soft)' }}>
                <span className="nr-pulse" style={{ width: 5, height: 5 }} />{b.businessStatusLabel}
              </span>
              <div className="min-w-0">
                <div className="text-[14px]" style={{ color: 'var(--nr-text-hi)' }}>{b.rank}位 · {b.name}</div>
                <div className="text-[11px] flex items-center gap-1" style={{ color: 'var(--nr-text-low)' }}>
                  <MapPin size={10} /> {b.area} · 当日営業分 {b.postCount}件
                </div>
              </div>
              <div><span className="nr-mono text-[11px]" style={{ color: 'var(--nr-text-low)' }}>女性書き込み</span><br /><span className="nr-mono text-[14px]" style={{ color: 'var(--nr-text-hi)' }}>{b.femaleCount}件</span></div>
              <div><span className="nr-mono text-[11px]" style={{ color: 'var(--nr-text-low)' }}>直近3時間</span><br /><span className="nr-mono text-[14px]" style={{ color: 'var(--nr-text-hi)' }}>{b.recentThreeHourCount}件</span></div>
              <div><span className="nr-mono text-[11px]" style={{ color: 'var(--nr-text-low)' }}>今日の予定</span><br /><span className="nr-mono text-[14px]" style={{ color: 'var(--nr-text-hi)' }}>{b.eventCount}件</span></div>
              <span className="nr-mono px-1.5 py-0.5 rounded-full text-[10px] flex items-center gap-1 nr-delta-up">
                <Activity size={10} />集計 {b.dataConfidence}点
              </span>
              <span className="nr-chip">詳細を見る</span>
            </motion.button>
          );
        })}
      </GlassCard>

      {/* Random / tag jump */}
      <GlassCard className="p-4 flex items-center gap-4 nr-hairline">
        <div className="flex-1">
          <div className="text-[13px]" style={{ color: 'var(--nr-text-hi)' }}>登録済みの店舗情報を確認</div>
          <div className="text-[11px] mt-0.5" style={{ color: 'var(--nr-text-low)' }}>未登録の住所・料金・公式URLは推測せず「未確認」と表示します。</div>
        </div>
        <a href="/map" className="nr-chip">地図で見る</a>
        <a href="/shops" className="nr-accent-btn rounded-full px-5 py-2 text-[13px]">店舗一覧を見る</a>
      </GlassCard>
    </div>
  );
}
