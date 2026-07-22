'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  Clock3,
  MessageSquareText,
  Search,
  Smile,
  UserRound,
  X,
} from 'lucide-react';
import type { Bar, RadarPost, RadarPostGender } from '../data/mock';
import { useNightRadarData } from '../data/runtime';
import { GlassCard } from '../ui-nr/GlassCard';

const POST_SCOPES = [
  { key: 'all', label: '名前・本文' },
  { key: 'name', label: '名前' },
  { key: 'body', label: '本文' },
  { key: 'emoji', label: '絵文字あり' },
] as const;

const POST_GENDERS: Array<{ key: 'all' | RadarPostGender; label: string }> = [
  { key: 'all', label: 'すべて' },
  { key: 'female', label: '女性' },
  { key: 'male', label: '男性' },
  { key: 'couple', label: 'カップル' },
  { key: 'unknown', label: '区分未記載' },
];

type PostScope = (typeof POST_SCOPES)[number]['key'];
type PostWindow = 'today' | 'recent';

function normalizeSearchText(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase('ja-JP').replace(/\s+/g, ' ').trim();
}

function includesQuery(value: string, query: string) {
  const normalizedQuery = normalizeSearchText(query);
  return !normalizedQuery || normalizeSearchText(value).includes(normalizedQuery);
}

function StorePostResult({ post }: { post: RadarPost }) {
  const [expanded, setExpanded] = useState(false);
  const longBody = post.body.length > 150;

  return (
    <article className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <strong className="break-words text-[14px]" style={{ color: 'var(--nr-text-hi)' }}>{post.authorName}</strong>
          <span className="nr-chip !px-2 !py-0.5 !text-[10px]" data-accent={post.gender === 'female'}>{post.genderLabel}</span>
          {post.hasEmoji && <span className="nr-chip !px-2 !py-0.5 !text-[10px]"><Smile size={10} aria-hidden="true" /> 絵文字</span>}
        </div>
        <time className="nr-mono flex shrink-0 items-center gap-1 text-[10px]" style={{ color: 'var(--nr-text-low)' }} dateTime={post.postedAt}>
          <Clock3 size={11} aria-hidden="true" /> {post.postedAtLabel}
        </time>
      </div>
      <p className={`mt-3 whitespace-pre-wrap break-words text-[12px] leading-[1.8] ${!expanded && longBody ? 'line-clamp-4' : ''}`} style={{ color: 'var(--nr-text-mid)' }}>
        {post.body}
      </p>
      {longBody && (
        <button type="button" className="nr-chip mt-3 !py-1" onClick={() => setExpanded((value) => !value)}>
          {expanded ? '閉じる' : '全文を見る'}
        </button>
      )}
    </article>
  );
}

export function StorePostSearchPanel({
  bar,
  onSearchAll,
  tourNameSearch = false,
}: {
  bar: Bar;
  onSearchAll: () => void;
  tourNameSearch?: boolean;
}) {
  const { posts: initialPosts } = useNightRadarData();
  const [open, setOpen] = useState(tourNameSearch);
  const [posts, setPosts] = useState<RadarPost[]>(() => initialPosts.filter((post) => post.storeId === bar.id));
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(posts.length ? 'ready' : tourNameSearch ? 'loading' : 'idle');
  const [loadedStoreId, setLoadedStoreId] = useState(posts.length ? bar.id : '');
  const [requestKey, setRequestKey] = useState(0);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<PostScope>(tourNameSearch ? 'name' : 'all');
  const [gender, setGender] = useState<'all' | RadarPostGender>('all');
  const [window, setWindow] = useState<PostWindow>('today');
  const [visibleCount, setVisibleCount] = useState(8);

  useEffect(() => {
    if (!open || loadedStoreId === bar.id) return;
    const controller = new AbortController();
    fetch(`/api/app-content?kind=posts&storeId=${encodeURIComponent(bar.id)}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json() as { posts?: RadarPost[]; error?: string };
        if (!response.ok || !payload.posts) throw new Error(payload.error || '書き込みを読み込めませんでした。');
        setPosts(payload.posts.filter((post) => post.storeId === bar.id));
        setLoadedStoreId(bar.id);
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setStatus('error');
      });
    return () => controller.abort();
  }, [bar.id, loadedStoreId, open, requestKey]);

  const filteredPosts = useMemo(() => posts.filter((post) => {
    if (window === 'today' && !post.isCurrentBusinessDay) return false;
    if (gender !== 'all' && post.gender !== gender) return false;
    if (scope === 'emoji' && !post.hasEmoji) return false;
    if (scope === 'name') return includesQuery(post.authorName, query);
    if (scope === 'body') return includesQuery(post.body, query);
    return includesQuery(`${post.authorName} ${post.body}`, query);
  }), [gender, posts, query, scope, window]);

  const reset = () => {
    setQuery('');
    setScope('all');
    setGender('all');
    setWindow('today');
    setVisibleCount(8);
  };

  const toggleOpen = () => {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen && loadedStoreId !== bar.id) setStatus('loading');
  };

  const retry = () => {
    setStatus('loading');
    setRequestKey((value) => value + 1);
  };

  return (
    <GlassCard className="nr-hairline overflow-hidden">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/[0.09] bg-white/[0.035]" aria-hidden="true">
            <Search size={16} color="var(--nr-accent)" />
          </span>
          <div className="min-w-0">
            <span className="nr-mono text-[10px]" style={{ color: 'var(--nr-accent-soft)' }}>店舗内検索</span>
            <h2 className="nr-heading mt-1 text-[20px]" style={{ color: 'var(--nr-text-hi)' }}>この店舗の書き込みを探す</h2>
            <p className="mt-1 text-[11px] leading-relaxed" style={{ color: 'var(--nr-text-low)' }}>
              {bar.name}の取得済み投稿を、名前・本文・絵文字・性別で絞り込みます。
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button type="button" className="nr-secondary-btn" onClick={onSearchAll}>全店舗から探す</button>
          <button
            type="button"
            className="nr-accent-btn flex items-center gap-2 rounded-lg px-4 py-2.5 text-[12px]"
            aria-expanded={open}
            aria-controls="store-post-search-content"
            onClick={toggleOpen}
          >
            {open ? '検索を閉じる' : `書き込みを探す（当日${bar.postCount}件）`}
            <ChevronDown size={14} aria-hidden="true" className={open ? 'rotate-180' : ''} />
          </button>
        </div>
      </div>

      {open && (
        <div id="store-post-search-content" className="border-t border-white/[0.08] p-4 sm:p-5">
          <div data-tour="name-search">
            <div className="flex items-center gap-3 rounded-xl border border-white/[0.1] bg-black/20 px-4">
              <Search size={16} color="var(--nr-text-mid)" aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => { setQuery(event.target.value); setVisibleCount(8); }}
                name={`store-post-search-${bar.id}`}
                aria-label={`${bar.name}の書き込みを検索`}
                autoComplete="off"
                placeholder={scope === 'name' ? '投稿者名を入力…' : '名前・書き込み内容・絵文字で検索…'}
                className="min-w-0 flex-1 bg-transparent py-3 text-[14px] focus-visible:outline-none"
                style={{ color: 'var(--nr-text-hi)' }}
              />
              {query && (
                <button type="button" aria-label="検索語を消す" onClick={() => setQuery('')} className="nr-chip grid !p-2 place-items-center">
                  <X size={14} aria-hidden="true" />
                </button>
              )}
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[auto_1fr_1fr]">
              <fieldset>
                <legend className="nr-mono mb-2 text-[10px]" style={{ color: 'var(--nr-text-low)' }}>取得期間</legend>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="nr-chip" data-active={window === 'today'} aria-pressed={window === 'today'} onClick={() => setWindow('today')}>当営業日</button>
                  <button type="button" className="nr-chip" data-active={window === 'recent'} aria-pressed={window === 'recent'} onClick={() => setWindow('recent')}>直近48時間</button>
                </div>
              </fieldset>
              <fieldset>
                <legend className="nr-mono mb-2 text-[10px]" style={{ color: 'var(--nr-text-low)' }}>検索対象</legend>
                <div className="flex flex-wrap gap-2">
                  {POST_SCOPES.map((item) => (
                    <button key={item.key} type="button" className="nr-chip" data-active={scope === item.key} aria-pressed={scope === item.key} onClick={() => setScope(item.key)}>
                      {item.key === 'name' && <UserRound size={11} aria-hidden="true" />}
                      {item.key === 'emoji' && <Smile size={11} aria-hidden="true" />}
                      {item.label}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="nr-mono mb-2 text-[10px]" style={{ color: 'var(--nr-text-low)' }}>性別</legend>
                <div className="flex flex-wrap gap-2">
                  {POST_GENDERS.map((item) => (
                    <button key={item.key} type="button" className="nr-chip" data-active={gender === item.key} aria-pressed={gender === item.key} onClick={() => setGender(item.key)}>{item.label}</button>
                  ))}
                </div>
              </fieldset>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-end justify-between gap-3 border-t border-white/[0.08] pt-4">
            <div>
              <span className="nr-mono text-[10px]" style={{ color: 'var(--nr-text-low)' }}>検索結果</span>
              <div className="mt-1 flex items-center gap-2">
                <MessageSquareText size={14} color="var(--nr-accent)" aria-hidden="true" />
                <strong className="text-[16px]" style={{ color: 'var(--nr-text-hi)' }}>{filteredPosts.length}件</strong>
                <span className="text-[10px]" style={{ color: 'var(--nr-text-low)' }}>{window === 'today' ? '当営業日の来店分' : '直近48時間の取得分'}</span>
              </div>
            </div>
            <button type="button" className="nr-chip" onClick={reset}>条件をすべて外す</button>
          </div>

          <div className="mt-3 grid gap-3">
            {status === 'loading' && (
              <div className="rounded-xl border border-dashed border-white/[0.1] p-7 text-center" role="status" aria-live="polite">
                <span className="nr-loading-dot" aria-hidden="true" />
                <p className="mt-3 text-[12px]" style={{ color: 'var(--nr-text-mid)' }}>この店舗の書き込みを読み込んでいます…</p>
              </div>
            )}
            {status === 'error' && (
              <div className="rounded-xl border border-dashed border-white/[0.1] p-7 text-center" role="alert">
                <p className="text-[13px]" style={{ color: 'var(--nr-text-hi)' }}>書き込みを読み込めませんでした。</p>
                <button type="button" className="nr-secondary-btn mx-auto mt-3 flex" onClick={retry}>再読み込み</button>
              </div>
            )}
            {status === 'ready' && filteredPosts.slice(0, visibleCount).map((post) => <StorePostResult key={post.id} post={post} />)}
            {status === 'ready' && filteredPosts.length > visibleCount && (
              <button type="button" className="nr-secondary-btn mx-auto flex" onClick={() => setVisibleCount((value) => value + 10)}>さらに10件を見る</button>
            )}
            {status === 'ready' && filteredPosts.length === 0 && (
              <div className="rounded-xl border border-dashed border-white/[0.1] p-7 text-center">
                <p className="text-[13px]" style={{ color: 'var(--nr-text-hi)' }}>条件に一致する書き込みはありません。</p>
                <p className="mt-2 text-[11px]" style={{ color: 'var(--nr-text-low)' }}>期間を「直近48時間」にするか、性別と検索対象を「すべて」に戻してください。</p>
              </div>
            )}
          </div>
        </div>
      )}
    </GlassCard>
  );
}
