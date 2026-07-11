import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Activity, Clock3, MapPin, MessageSquareText, Search, Smile, Store, UserRound, X } from 'lucide-react';
import { matchesStoreSearch } from '@/lib/store-search';
import { GlassCard } from '../ui-nr/GlassCard';
import { WordReveal } from '../ui-nr/Reveal';
import { type Bar, type RadarPost, type RadarPostGender } from '../data/mock';
import { useNightRadarData } from '../data/runtime';

const STORE_CATEGORIES = ['すべて', '営業時間内', '直近3時間', '女性書き込みあり', '初回来店の記述', '複数来店の記述', '予定あり', '集計信頼度80点以上'];
const POST_SCOPES = [
  { key: 'all', label: '名前・本文' },
  { key: 'name', label: '名前' },
  { key: 'body', label: '本文' },
  { key: 'emoji', label: '絵文字あり' },
] as const;
const POST_GENDERS: Array<{ key: 'all' | RadarPostGender; label: string }> = [
  { key: 'all', label: 'すべての性別' },
  { key: 'female', label: '女性' },
  { key: 'male', label: '男性' },
  { key: 'unknown', label: '性別未記載' },
];
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

function normalizeSearchText(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase('ja-JP').replace(/\s+/g, ' ').trim();
}

function includesQuery(value: string, query: string) {
  const normalizedQuery = normalizeSearchText(query);
  return !normalizedQuery || normalizeSearchText(value).includes(normalizedQuery);
}

function femaleValue(bar: Bar) {
  if (bar.genderStatus === 'unavailable') return '判定不可';
  if (bar.genderStatus === 'partial') return `${bar.femaleCount}件（参考）`;
  return `${bar.femaleCount}件`;
}

function PostRow({ post, onOpen }: { post: RadarPost; onOpen: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const longBody = post.body.length > 120;

  return (
    <article className="rounded-2xl border border-white/[0.08] bg-white/[0.025] px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-semibold" style={{ color: 'var(--nr-text-hi)' }}>{post.authorName}</span>
            <span className="nr-chip !px-2 !py-0.5 !text-[10px]" data-accent={post.gender === 'female'}>{post.genderLabel}</span>
            {post.hasEmoji && <span className="nr-chip !px-2 !py-0.5 !text-[10px]"><Smile size={10} /> 絵文字</span>}
          </div>
          <button type="button" className="mt-1.5 flex items-center gap-1 text-left text-[11px] hover:underline" style={{ color: 'var(--nr-accent-soft)' }} onClick={() => onOpen(post.storeId)}>
            <Store size={11} /> {post.storeName}
          </button>
        </div>
        <time className="nr-mono flex items-center gap-1 text-[11px]" style={{ color: 'var(--nr-text-low)' }} dateTime={post.postedAt}>
          <Clock3 size={11} /> {post.postedAtLabel}
        </time>
      </div>
      <p className={`mt-3 whitespace-pre-wrap break-words text-[13px] leading-[1.8] ${!expanded && longBody ? 'line-clamp-3' : ''}`} style={{ color: 'var(--nr-text-mid)' }}>
        {post.body}
      </p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="nr-mono text-[10px]" style={{ color: 'var(--nr-text-low)' }}>
          {post.isCurrentBusinessDay ? '今日の集計対象' : '直近48時間の取得分'}
        </span>
        {longBody && (
          <button type="button" className="nr-chip !py-1" onClick={() => setExpanded((value) => !value)}>
            {expanded ? '閉じる' : '全文を見る'}
          </button>
        )}
      </div>
    </article>
  );
}

export function SearchPage({ onOpen }: { onOpen: (id: string) => void }) {
  const { bars, posts } = useNightRadarData();
  const [mode, setMode] = useState<'posts' | 'stores'>('posts');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('すべて');
  const [postScope, setPostScope] = useState<(typeof POST_SCOPES)[number]['key']>('all');
  const [postGender, setPostGender] = useState<'all' | RadarPostGender>('all');
  const [postWindow, setPostWindow] = useState<'today' | 'recent'>('today');
  const [visiblePostCount, setVisiblePostCount] = useState(40);

  const filteredBars = useMemo(() => bars.filter((bar) => {
    const matchesQuery = matchesStoreSearch(q, bar.searchKeywords);
    return matchesQuery && matchesCategory(bar, category);
  }).toSorted((left, right) =>
    category === '女性書き込みあり'
      ? right.femaleCount - left.femaleCount || left.rank - right.rank
      : left.rank - right.rank,
  ), [bars, category, q]);

  const filteredPosts = useMemo(() => posts.filter((post) => {
    if (postWindow === 'today' && !post.isCurrentBusinessDay) return false;
    if (postGender !== 'all' && post.gender !== postGender) return false;
    if (postScope === 'emoji' && !post.hasEmoji) return false;
    if (postScope === 'name') return includesQuery(post.authorName, q);
    if (postScope === 'body') return includesQuery(post.body, q);
    return includesQuery(`${post.authorName} ${post.body} ${post.storeName}`, q);
  }), [postGender, postScope, postWindow, posts, q]);

  const activeCount = mode === 'posts' ? filteredPosts.length : filteredBars.length;
  const reset = () => {
    setQ('');
    setCategory('すべて');
    setPostScope('all');
    setPostGender('all');
    setPostWindow('today');
    setVisiblePostCount(40);
  };

  return (
    <div className="flex flex-col gap-7">
      <div className="pt-4">
        <motion.div className="mb-4 flex items-center gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, ease }}>
          <span className="nr-pulse" />
          <span className="nr-mono text-[12px]" style={{ color: 'var(--nr-text-mid)' }}>探す</span>
        </motion.div>
        <h1 className="nr-heading text-[34px] leading-[1.15] sm:text-[40px]" style={{ color: 'var(--nr-text-hi)' }}>
          <WordReveal text="店舗と書き込みを、" />
          <br />
          <WordReveal text="同じ画面で確認する。" delay={0.3} />
        </h1>
        <motion.p className="mt-4 max-w-[66ch] text-[14px] leading-[1.7]" style={{ color: 'var(--nr-text-mid)' }} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease, delay: 0.6 }}>
          店舗条件だけでなく、取得済みの顧客書き込みを名前・本文・絵文字・性別から検索できます。性別未記載の投稿も除外しません。
        </motion.p>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-1.5" role="tablist" aria-label="検索対象">
        <button type="button" role="tab" aria-selected={mode === 'posts'} className="nr-search-mode" data-active={mode === 'posts'} onClick={() => { setMode('posts'); setQ(''); }}>
          <MessageSquareText size={15} /> 書き込みを探す <span>{posts.filter((post) => post.isCurrentBusinessDay).length}件</span>
        </button>
        <button type="button" role="tab" aria-selected={mode === 'stores'} className="nr-search-mode" data-active={mode === 'stores'} onClick={() => { setMode('stores'); setQ(''); }}>
          <Store size={15} /> 店舗を探す <span>{bars.length}店</span>
        </button>
      </div>

      <GlassCard className="nr-hairline p-4 sm:p-5">
        <div className="flex items-center gap-3 rounded-xl border border-white/[0.1] bg-black/20 px-4">
          <Search size={16} color="var(--nr-text-mid)" />
          <input
            value={q}
            onChange={(event) => { setQ(event.target.value); setVisiblePostCount(40); }}
            name="night-radar-search"
            aria-label={mode === 'posts' ? '書き込みを検索' : '店舗を検索'}
            autoComplete="off"
            placeholder={mode === 'posts' ? '名前・書き込み内容・絵文字で検索…' : '店名・エリア・特徴で検索…'}
            className="min-w-0 flex-1 bg-transparent py-3 text-[14px] focus-visible:outline-none"
            style={{ color: 'var(--nr-text-hi)' }}
          />
          {q && <button type="button" aria-label="検索語を消す" onClick={() => setQ('')} className="nr-chip grid !p-2 place-items-center"><X size={14} /></button>}
        </div>

        {mode === 'posts' ? (
          <div className="mt-4 grid gap-4">
            <div>
              <div className="nr-mono mb-2 text-[10px]" style={{ color: 'var(--nr-text-low)' }}>取得期間</div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="nr-chip" data-active={postWindow === 'today'} onClick={() => setPostWindow('today')}>今日の営業分</button>
                <button type="button" className="nr-chip" data-active={postWindow === 'recent'} onClick={() => setPostWindow('recent')}>直近48時間</button>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="nr-mono mb-2 text-[10px]" style={{ color: 'var(--nr-text-low)' }}>検索対象</div>
                <div className="flex flex-wrap gap-2">
                  {POST_SCOPES.map((scope) => <button key={scope.key} type="button" className="nr-chip" data-active={postScope === scope.key} onClick={() => setPostScope(scope.key)}>{scope.key === 'name' && <UserRound size={11} />}{scope.key === 'emoji' && <Smile size={11} />}{scope.label}</button>)}
                </div>
              </div>
              <div>
                <div className="nr-mono mb-2 text-[10px]" style={{ color: 'var(--nr-text-low)' }}>性別</div>
                <div className="flex flex-wrap gap-2">
                  {POST_GENDERS.map((gender) => <button key={gender.key} type="button" className="nr-chip" data-active={postGender === gender.key} onClick={() => setPostGender(gender.key)}>{gender.label}</button>)}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <div className="nr-mono mb-2 text-[10px]" style={{ color: 'var(--nr-text-low)' }}>店舗条件</div>
            <div className="flex flex-wrap gap-2">
              {STORE_CATEGORIES.map((item) => <button key={item} type="button" className="nr-chip" data-active={category === item} aria-pressed={category === item} onClick={() => setCategory((current) => current === item && item !== 'すべて' ? 'すべて' : item)}>{item}</button>)}
            </div>
          </div>
        )}
      </GlassCard>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="nr-mono text-[11px]" style={{ color: 'var(--nr-text-mid)' }}>検索結果</span>
          <h2 className="nr-heading mt-1 text-[22px]" style={{ color: 'var(--nr-text-hi)' }}><span style={{ color: 'var(--nr-accent)' }}>{activeCount}</span>{mode === 'posts' ? '件の書き込み' : '店の候補'}</h2>
        </div>
        <button type="button" className="nr-chip" onClick={reset}>条件をすべて外す</button>
      </div>

      {mode === 'posts' ? (
        <div className="grid gap-3">
          {filteredPosts.slice(0, visiblePostCount).map((post) => <PostRow key={post.id} post={post} onOpen={onOpen} />)}
          {filteredPosts.length > visiblePostCount && (
            <button type="button" className="nr-secondary-btn mx-auto flex" onClick={() => setVisiblePostCount((value) => value + 40)}>さらに40件を見る</button>
          )}
          {filteredPosts.length === 0 && (
            <GlassCard className="nr-hairline p-8 text-center">
              <p className="text-[14px]" style={{ color: 'var(--nr-text-hi)' }}>一致する書き込みがありません</p>
              <p className="mt-2 text-[12px]" style={{ color: 'var(--nr-text-low)' }}>性別や期間を「すべて」に戻すか、名前の一部だけで検索してください。</p>
            </GlassCard>
          )}
        </div>
      ) : (
        <GlassCard className="nr-hairline p-2">
          {filteredBars.map((bar, index) => (
            <motion.button key={bar.id} type="button" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(index, 12) * 0.04, duration: 0.5, ease }} onClick={() => onOpen(bar.id)} className="grid w-full grid-cols-2 items-center gap-3 rounded-xl px-4 py-4 text-left transition-colors hover:bg-white/[0.04] md:grid-cols-[auto_1.6fr_1fr_1fr_1fr_auto] md:gap-4">
              <span className="nr-mono flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]" style={{ background: 'rgba(255,106,91,0.10)', color: 'var(--nr-accent-soft)' }}><span className="nr-pulse" style={{ width: 5, height: 5 }} />{bar.businessStatusLabel}</span>
              <div className="min-w-0">
                <div className="text-[14px]" style={{ color: 'var(--nr-text-hi)' }}>{bar.rank}位 · {bar.name}</div>
                <div className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--nr-text-low)' }}><MapPin size={10} /> {bar.area}</div>
              </div>
              <div><span className="nr-mono text-[10px]" style={{ color: 'var(--nr-text-low)' }}>当日総書き込み</span><br /><span className="nr-mono text-[14px]">{bar.postCount}件</span></div>
              <div><span className="nr-mono text-[10px]" style={{ color: 'var(--nr-text-low)' }}>女性書き込み</span><br /><span className="nr-mono text-[14px]">{femaleValue(bar)}</span></div>
              <div><span className="nr-mono text-[10px]" style={{ color: 'var(--nr-text-low)' }}>今日の予定</span><br /><span className="nr-mono text-[14px]">{bar.eventCount}件</span></div>
              <span className="nr-chip"><Activity size={10} />店舗詳細</span>
            </motion.button>
          ))}
          {filteredBars.length === 0 && <div className="px-5 py-8 text-center text-[13px]" style={{ color: 'var(--nr-text-mid)' }}>一致する店舗はありません。条件を外して再度確認してください。</div>}
        </GlassCard>
      )}
    </div>
  );
}
