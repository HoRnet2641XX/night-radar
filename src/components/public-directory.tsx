import Link from 'next/link'
import type { CSSProperties } from 'react'
import { NightRadarAgeGate } from './night-radar-age-gate'
import { PublicFavoriteButton } from './public-favorite-button'
import {
  areaSlugForLabel,
  buildPublicFaqSchema,
  filterPublicStores,
  formatPublicStoreName,
  getAreaLabelFromSlug,
  publicAbsoluteUrl,
  publicAreas,
  publicConditions,
  publicRankingKinds,
  sortByRanking,
  storeDetailPath,
  type PublicDirectoryState,
  type PublicStoreSummary,
  type RankingKind,
} from '@/lib/public-directory'
import type { PublicGuide } from '@/lib/public-guides'
import styles from './public-directory.module.css'

export function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  )
}

export function PublicShell({
  children,
  current,
}: {
  children: React.ReactNode
  current?: 'shops' | 'ranking' | 'map' | 'areas' | 'guides' | 'features' | 'likes'
}) {
  const navItems = [
    { key: 'shops', href: '/shops', label: '店舗' },
    { key: 'ranking', href: '/ranking', label: 'ランキング' },
    { key: 'map', href: '/map', label: '地図' },
    { key: 'areas', href: '/areas', label: 'エリア' },
    { key: 'guides', href: '/guides', label: '使い方' },
    { key: 'likes', href: '/likes', label: '保存' },
  ]

  return (
    <main className={styles.publicPage} id="main">
      <NightRadarAgeGate />
      <header className={styles.publicHeader}>
        <Link className={styles.logo} href="/lp" aria-label="Night Radar LPへ">
          <span>Night</span>Radar
        </Link>
        <nav aria-label="公開ページ">
          {navItems.map((item) => (
            <Link
              aria-current={current === item.key ? 'page' : undefined}
              href={item.href}
              key={item.key}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <Link className={styles.appButton} href="/login?next=/app">
          アプリへ
        </Link>
      </header>
      {children}
      <footer className={styles.publicFooter}>
        <p>Night Radarは公開情報を店舗単位で整理するサービスです。料金や営業状況は公式情報も確認してください。</p>
        <div>
          <Link href="/terms">利用規約</Link>
          <Link href="/privacy">プライバシー</Link>
          <Link href="/feed.xml">更新フィード</Link>
        </div>
      </footer>
    </main>
  )
}

export function PublicHomeJsonLd() {
  const faq = buildPublicFaqSchema()
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'WebSite',
            name: 'Night Radar',
            url: publicAbsoluteUrl('/'),
            potentialAction: {
              '@type': 'SearchAction',
              target: `${publicAbsoluteUrl('/shops')}?q={search_term_string}`,
              'query-input': 'required name=search_term_string',
            },
          },
          {
            '@type': 'Organization',
            name: 'Night Radar',
            url: publicAbsoluteUrl('/'),
            logo: publicAbsoluteUrl('/favicon.svg'),
          },
          {
            '@type': 'FAQPage',
            mainEntity: faq.map((item) => ({
              '@type': 'Question',
              name: item.question,
              acceptedAnswer: {
                '@type': 'Answer',
                text: item.answer,
              },
            })),
          },
        ],
      }}
    />
  )
}

export function BreadcrumbJsonLd({ items }: { items: Array<{ name: string; href: string }> }) {
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: items.map((item, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: item.name,
          item: publicAbsoluteUrl(item.href),
        })),
      }}
    />
  )
}

export function DirectoryHero({ state }: { state: PublicDirectoryState }) {
  const hotCount = state.summaries.filter((summary) => summary.point.score >= 74).length
  const openCount = state.summaries.filter((summary) => summary.isOpenNow).length
  const todayEventCount = state.summaries.reduce((sum, summary) => sum + summary.todayEventCount, 0)
  const top = sortByRanking(state.summaries, 'today')[0]

  return (
    <section className={styles.heroPanel}>
      <div>
        <p className={styles.kicker}>今日行くべき店を決めるレーダー</p>
        <h1>店舗を探す前に、今夜の動きを見る。</h1>
        <p>
          BBS、イベント、更新時刻、女性の書き込みをまとめて、候補に残す店だけを比較します。
        </p>
        <div className={styles.heroActions}>
          <Link href="/shops">店舗を探す</Link>
          <Link href="/ranking/today">今日のランキング</Link>
        </div>
      </div>
      <aside className={styles.heroMeter} aria-label="今日のサマリー">
        <span>本日の先頭候補</span>
        <strong>{top ? formatPublicStoreName(top.store) : '観測中'}</strong>
        <p>{top?.primaryReason ?? '巡回データを集計しています。'}</p>
        <dl>
          <div>
            <dt>掲載</dt>
            <dd>{state.stores.length}店</dd>
          </div>
          <div>
            <dt>Hot</dt>
            <dd>{hotCount}店</dd>
          </div>
          <div>
            <dt>営業中</dt>
            <dd>{openCount}店</dd>
          </div>
          <div>
            <dt>予定</dt>
            <dd>{todayEventCount}件</dd>
          </div>
        </dl>
      </aside>
    </section>
  )
}

export function PublicSummaryStrip({ state }: { state: PublicDirectoryState }) {
  const recentThreeHours = state.summaries.reduce((sum, summary) => sum + summary.recentThreeHourCount, 0)
  const femalePostTotal = state.summaries.reduce((sum, summary) => sum + summary.femalePostCount, 0)

  return (
    <section className={styles.summaryStrip} aria-label="公開サマリー">
      <article>
        <span>直近3時間</span>
        <strong>{recentThreeHours}件</strong>
        <p>正規化投稿から集計</p>
      </article>
      <article>
        <span>女性投稿</span>
        <strong>{femalePostTotal}件</strong>
        <p>直近24時間の性別表記から集計</p>
      </article>
      <article>
        <span>巡回対象</span>
        <strong>{state.sources.filter((source) => source.active).length}件</strong>
        <p>BBS URL登録済み</p>
      </article>
    </section>
  )
}

export function StoreFilterLinks({
  basePath,
  activeArea,
  activeCondition,
}: {
  basePath: string
  activeArea?: string
  activeCondition?: string
}) {
  return (
    <section className={styles.filterPanel} aria-label="店舗検索フィルタ">
      <div>
        <span>エリア</span>
        <div className={styles.chipRow}>
          {publicAreas.map((area) => (
            <Link
              aria-current={activeArea === area.slug ? 'true' : undefined}
              href={`${basePath}?area=${area.slug}${activeCondition ? `&condition=${activeCondition}` : ''}`}
              key={area.slug}
            >
              {area.label}
            </Link>
          ))}
        </div>
      </div>
      <div>
        <span>条件</span>
        <div className={styles.chipRow}>
          {publicConditions.map((condition) => (
            <Link
              aria-current={activeCondition === condition.key ? 'true' : undefined}
              href={`${basePath}?${activeArea ? `area=${activeArea}&` : ''}condition=${condition.key}`}
              key={condition.key}
            >
              {condition.label}
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}

export function StoreSearchForm({
  defaultQuery,
  area,
  condition,
}: {
  defaultQuery?: string
  area?: string
  condition?: string
}) {
  return (
    <form className={styles.searchForm} action="/shops">
      <label>
        <span>店舗名、エリアで探す</span>
        <input name="q" defaultValue={defaultQuery} placeholder="例: 渋谷、BAR、Neo" />
      </label>
      {area ? <input type="hidden" name="area" value={area} /> : null}
      {condition ? <input type="hidden" name="condition" value={condition} /> : null}
      <button type="submit">検索</button>
    </form>
  )
}

export function PublicStoreGrid({
  summaries,
  variant = 'cards',
}: {
  summaries: PublicStoreSummary[]
  variant?: 'cards' | 'decision'
}) {
  if (!summaries.length) {
    return (
      <section className={styles.emptyState}>
        <p>条件に合う店舗がありません。</p>
        <h2>条件を一つ外すと候補が見つかりやすくなります。</h2>
        <Link href="/shops">条件を戻す</Link>
      </section>
    )
  }

  if (variant === 'decision') {
    const [leader, ...rest] = summaries
    const runnerUps = rest.slice(0, 2)
    const remaining = rest.slice(2)

    return (
      <>
        <section className={styles.decisionBoard} aria-label="今日の候補">
          <DecisionLeaderCard summary={leader} />
          <div className={styles.decisionStack}>
            {runnerUps.map((summary, index) => (
              <DecisionMiniCard key={summary.store.id} rank={index + 2} summary={summary} />
            ))}
          </div>
        </section>
        {remaining.length ? (
          <section className={styles.storeList} aria-label="比較候補">
            <div className={styles.listHeader}>
              <p>比較候補</p>
              <span>{remaining.length}店</span>
            </div>
            {remaining.map((summary, index) => (
              <DecisionListRow key={summary.store.id} rank={index + 4} summary={summary} />
            ))}
          </section>
        ) : null}
      </>
    )
  }

  return (
    <section className={styles.storeGrid} aria-label="店舗一覧">
      {summaries.map((summary, index) => (
        <PublicStoreCard key={summary.store.id} rank={index + 1} summary={summary} />
      ))}
    </section>
  )
}

function DecisionLeaderCard({ summary }: { summary: PublicStoreSummary }) {
  return (
    <article className={styles.decisionLeader}>
      <div className={styles.decisionLeaderBody}>
        <span className={styles.decisionLabel}>今日の結論</span>
        <h2>
          <Link href={storeDetailPath(summary.store)}>{formatPublicStoreName(summary.store)}</Link>
        </h2>
        <p>{summary.primaryReason}</p>
        <div className={styles.decisionTags}>
          <span>{summary.temperatureLabel}</span>
          <span>{summary.areaLabel}</span>
          <span>{summary.sessionLabel}</span>
        </div>
      </div>
      <div className={styles.decisionGauge} aria-label={`スコア ${summary.point.score}`}>
        <strong>{summary.point.score}</strong>
        <span>温度</span>
      </div>
      <PublicStoreRadar summary={summary} variant="leader" />
      <dl className={styles.decisionFacts}>
        <div>
          <dt>直近3時間</dt>
          <dd>{summary.recentThreeHourCount}件</dd>
        </div>
        <div>
          <dt>女性投稿</dt>
          <dd>{summary.femalePostCount}件</dd>
        </div>
        <div>
          <dt>更新</dt>
          <dd>{summary.lastUpdatedLabel}</dd>
        </div>
        <div>
          <dt>料金</dt>
          <dd>{summary.priceLabel}</dd>
        </div>
      </dl>
      <div className={styles.decisionActions}>
        <Link href={storeDetailPath(summary.store)}>行く前確認</Link>
        <a href={summary.mapUrl} target="_blank" rel="noreferrer">
          地図
        </a>
        <PublicFavoriteButton storeId={summary.store.id} />
      </div>
    </article>
  )
}

function DecisionMiniCard({ summary, rank }: { summary: PublicStoreSummary; rank: number }) {
  const width = `${Math.max(12, Math.min(100, summary.point.score))}%`

  return (
    <article className={styles.decisionMini}>
      <div>
        <span>#{rank}</span>
        <strong>{summary.temperatureLabel}</strong>
      </div>
      <h2>
        <Link href={storeDetailPath(summary.store)}>{formatPublicStoreName(summary.store)}</Link>
      </h2>
      <p>{summary.primaryReason}</p>
      <PublicStoreRadar summary={summary} variant="mini" />
      <div className={styles.miniMeter} aria-hidden="true">
        <span style={{ inlineSize: width }} />
      </div>
      <dl>
        <div>
          <dt>女性投稿</dt>
          <dd>{summary.femalePostCount}件</dd>
        </div>
        <div>
          <dt>更新</dt>
          <dd>{summary.lastUpdatedLabel}</dd>
        </div>
      </dl>
    </article>
  )
}

function DecisionListRow({ summary, rank }: { summary: PublicStoreSummary; rank: number }) {
  return (
    <article className={styles.decisionRow}>
      <span className={styles.rowRank}>{rank}</span>
      <div>
        <p>{summary.temperatureLabel}</p>
        <h2>
          <Link href={storeDetailPath(summary.store)}>{formatPublicStoreName(summary.store)}</Link>
        </h2>
        <small>{summary.primaryReason}</small>
      </div>
      <PublicStoreRadar summary={summary} variant="row" />
      <dl>
        <div>
          <dt>温度</dt>
          <dd>{summary.point.score}</dd>
        </div>
        <div>
          <dt>女性投稿</dt>
          <dd>{summary.femalePostCount}件</dd>
        </div>
        <div>
          <dt>直近</dt>
          <dd>{summary.recentThreeHourCount}件</dd>
        </div>
      </dl>
      <Link href={storeDetailPath(summary.store)}>確認</Link>
    </article>
  )
}

export function PublicStoreCard({ summary, rank }: { summary: PublicStoreSummary; rank: number }) {
  return (
    <article className={styles.storeCard}>
      <div className={styles.storeCardTop}>
        <span>#{rank}</span>
        <PublicFavoriteButton storeId={summary.store.id} />
      </div>
      <div className={styles.storeTitleRow}>
        <div>
          <p>{summary.temperatureLabel}</p>
          <h2>
            <Link href={storeDetailPath(summary.store)}>{formatPublicStoreName(summary.store)}</Link>
          </h2>
        </div>
        <strong>{summary.point.score}</strong>
      </div>
      <p className={styles.reasonText}>{summary.primaryReason}</p>
      <dl className={styles.storeFacts}>
        <div>
          <dt>女性投稿</dt>
          <dd>{summary.femalePostCount}件</dd>
        </div>
        <div>
          <dt>直近3時間</dt>
          <dd>{summary.recentThreeHourCount}件</dd>
        </div>
        <div>
          <dt>更新</dt>
          <dd>{summary.lastUpdatedLabel}</dd>
        </div>
        <div>
          <dt>料金</dt>
          <dd>{summary.priceLabel}</dd>
        </div>
      </dl>
      <div className={styles.storeMetaRow}>
        <span>{summary.areaLabel}</span>
        <span>{summary.sessionLabel}</span>
        {summary.todayEventCount ? <span>本日予定 {summary.todayEventCount}件</span> : null}
      </div>
      <PublicStoreRadar summary={summary} />
      <div className={styles.cardActions}>
        <Link href={storeDetailPath(summary.store)}>行く前確認</Link>
        <a href={summary.mapUrl} target="_blank" rel="noreferrer">
          地図
        </a>
      </div>
    </article>
  )
}

export function RankingNavigation({ active }: { active: RankingKind }) {
  return (
    <nav className={styles.rankingNav} aria-label="ランキング種別">
      {publicRankingKinds.map((kind) => (
        <Link
          aria-current={active === kind.key ? 'page' : undefined}
          href={kind.key === 'today' ? '/ranking/today' : `/ranking/${kind.key}`}
          key={kind.key}
        >
          <span>{kind.label}</span>
          <small>{kind.description}</small>
        </Link>
      ))}
    </nav>
  )
}

export function RankingView({ kind, state }: { kind: RankingKind; state: PublicDirectoryState }) {
  const active = publicRankingKinds.find((item) => item.key === kind) ?? publicRankingKinds[0]
  const items = filterPublicStores(state.summaries, { ranking: kind }).slice(0, 12)
  const leader = items[0]

  return (
    <>
      <section className={styles.pageIntro}>
        <p className={styles.kicker}>ランキング</p>
        <h1>{active.label}で候補を見る</h1>
        <p>{active.description}</p>
      </section>
      <RankingNavigation active={kind} />
      {leader ? (
        <section className={styles.leaderCard}>
          <div>
            <span>1位</span>
            <h2>{formatPublicStoreName(leader.store)}</h2>
            <p>{leader.primaryReason}</p>
          </div>
          <dl>
            <div>
              <dt>スコア</dt>
              <dd>{leader.point.score}</dd>
            </div>
            <div>
              <dt>女性投稿</dt>
              <dd>{leader.femalePostCount}件</dd>
            </div>
            <div>
              <dt>女性率</dt>
              <dd>{leader.womenRatio == null ? '観測中' : `${leader.womenRatio}%`}</dd>
            </div>
            <div>
              <dt>更新</dt>
              <dd>{leader.lastUpdatedLabel}</dd>
            </div>
          </dl>
          <Link href={storeDetailPath(leader.store)}>詳細を見る</Link>
        </section>
      ) : null}
      <PublicStoreGrid summaries={items} />
    </>
  )
}

export function StoreDetailView({ summary }: { summary: PublicStoreSummary }) {
  const relatedEvents = summary.events.slice(0, 6)
  const recentPosts = summary.normalizedPosts.slice(0, 5)

  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: '店舗一覧', href: '/shops' },
          { name: formatPublicStoreName(summary.store), href: storeDetailPath(summary.store) },
        ]}
      />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'LocalBusiness',
          name: formatPublicStoreName(summary.store),
          url: publicAbsoluteUrl(storeDetailPath(summary.store)),
          address: summary.addressLabel === '住所は公式で確認' ? undefined : summary.addressLabel,
          areaServed: summary.areaLabel,
          sameAs: summary.officialUrl ? [summary.officialUrl] : undefined,
        }}
      />
      <section className={styles.detailHero}>
        <div>
          <p className={styles.kicker}>{summary.temperatureLabel}</p>
          <h1>{formatPublicStoreName(summary.store)}</h1>
          <p>{summary.primaryReason}</p>
          <div className={styles.heroActions}>
            {summary.officialUrl ? (
              <a href={summary.officialUrl} target="_blank" rel="noreferrer">
                公式を見る
              </a>
            ) : null}
            {summary.bbsUrl ? (
              <a href={summary.bbsUrl} target="_blank" rel="noreferrer">
                BBSを見る
              </a>
            ) : null}
            <a href={summary.mapUrl} target="_blank" rel="noreferrer">
              地図を開く
            </a>
          </div>
        </div>
        <aside className={styles.detailScore}>
          <strong>{summary.point.score}</strong>
          <span>今日の温度</span>
          <p>{summary.point.verdict}</p>
        </aside>
      </section>
      <section className={styles.detailRadarPanel} aria-label="店舗レーダー">
        <div>
          <p className={styles.kicker}>店舗レーダー</p>
          <h2>男女比率と動きを同じ目盛りで見る</h2>
          <p>円は女性率、縦グラフは熱量・直近投稿・24時間投稿・本日イベントを示します。</p>
        </div>
        <PublicStoreRadar summary={summary} variant="detail" />
      </section>

      <section className={styles.confirmGrid} aria-label="行く前確認">
        <article>
          <span>営業</span>
          <strong>{summary.sessionLabel}</strong>
          <p>{summary.store.hasDaytime ? `昼 ${summary.store.openingHourDay || '確認中'}` : '昼営業なし'} / {summary.store.hasNight ? `夜 ${summary.store.openingHourNight || '確認中'}` : '夜営業なし'}</p>
        </article>
        <article>
          <span>料金</span>
          <strong>{summary.priceLabel}</strong>
          <p>未入力の店舗は公式情報を確認してください。</p>
        </article>
        <article>
          <span>場所</span>
          <strong>{summary.areaLabel}</strong>
          <p>{summary.stationLabel} / {summary.addressLabel}</p>
        </article>
        <article>
          <span>根拠</span>
          <strong>女性 {summary.femalePostCount}件</strong>
          <p>直近24時間の性別表記から集計。直近3時間は{summary.recentThreeHourCount}件です。</p>
        </article>
      </section>

      <section className={styles.detailColumns}>
        <article>
          <h2>今日見る理由</h2>
          <ul>
            <li>{summary.primaryReason}</li>
            <li>女性書き込み: {summary.femalePostCount}件</li>
            <li>女性率: {summary.womenRatio == null ? '観測中' : `${summary.womenRatio}%`}</li>
            <li>本日のイベント: {summary.todayEventCount}件</li>
            <li>最終更新: {summary.lastUpdatedLabel}</li>
          </ul>
        </article>
        <article>
          <h2>イベント</h2>
          {relatedEvents.length ? (
            <ul>
              {relatedEvents.map((event) => (
                <li key={event.id}>
                  <strong>{event.date} {event.startsAt}</strong>
                  <span>{event.title}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p>登録済みイベントはまだありません。</p>
          )}
        </article>
      </section>

      <section className={styles.recentPostPanel}>
        <h2>直近のBBS要約</h2>
        {recentPosts.length ? (
          <div>
            {recentPosts.map((post) => (
              <article key={post.id}>
                <span>{post.postedAt ? new Date(post.postedAt).toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' }) : '時刻確認中'}</span>
                <strong>{post.authorName} / {post.authorGender}</strong>
                <p>{post.body}</p>
              </article>
            ))}
          </div>
        ) : (
          <p>正規化投稿を蓄積すると、行く前に見るべき投稿がここへ出ます。</p>
        )}
      </section>
    </>
  )
}

function clampPublicPercent(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function scaledPublicBar(value: number, max: number) {
  if (!Number.isFinite(value) || value <= 0) return 5
  return Math.max(7, Math.min(100, Math.round((value / max) * 100)))
}

function PublicStoreRadar({
  summary,
  variant = 'card',
}: {
  summary: PublicStoreSummary
  variant?: 'card' | 'leader' | 'mini' | 'row' | 'detail'
}) {
  const womenRatio = summary.womenRatio == null ? 0 : clampPublicPercent(summary.womenRatio)
  const menRatio = summary.womenRatio == null ? 0 : 100 - womenRatio
  const recentCount = summary.recentThreeHourCount
  const dayCount = summary.recentPostCount
  const eventCount = summary.todayEventCount
  const hasGender = summary.womenRatio != null
  const style = {
    '--public-women-ratio': `${womenRatio}%`,
    '--public-heat-height': `${clampPublicPercent(summary.point.score)}%`,
    '--public-recent-height': `${scaledPublicBar(recentCount, 12)}%`,
    '--public-day-height': `${scaledPublicBar(dayCount, 60)}%`,
    '--public-event-height': `${scaledPublicBar(eventCount, 4)}%`,
  } as CSSProperties

  return (
    <div className={`${styles.publicStoreRadar} ${styles[`publicStoreRadar_${variant}`]}`} style={style}>
      <div className={styles.publicRadarDonut} aria-label={hasGender ? `女性率 ${womenRatio}%、男性率 ${menRatio}%` : '女性率は観測中'}>
        <strong>{hasGender ? womenRatio : '--'}<small>%</small></strong>
        <span>女性率</span>
      </div>
      <div className={styles.publicRadarBars} aria-label="店舗レーダー縦グラフ">
        <span>
          <i data-kind="heat" />
          <em>熱量</em>
          <strong>{summary.point.score}</strong>
        </span>
        <span>
          <i data-kind="recent" />
          <em>直近</em>
          <strong>{recentCount}</strong>
        </span>
        <span>
          <i data-kind="day" />
          <em>24h</em>
          <strong>{dayCount}</strong>
        </span>
        <span>
          <i data-kind="event" />
          <em>予定</em>
          <strong>{eventCount}</strong>
        </span>
      </div>
      <p>
        {hasGender ? `女性 ${womenRatio}% / 男性 ${menRatio}%` : '男女比率は観測中'}・直近3時間 {recentCount}件
      </p>
    </div>
  )
}

export function AreaIndexView({ state }: { state: PublicDirectoryState }) {
  const counts = new Map<string, number>()
  state.summaries.forEach((summary) => {
    counts.set(summary.areaLabel, (counts.get(summary.areaLabel) ?? 0) + 1)
  })
  const areaItems = [...counts.entries()].toSorted((a, b) => b[1] - a[1])

  return (
    <>
      <section className={styles.pageIntro}>
        <p className={styles.kicker}>エリア検索</p>
        <h1>移動しやすい場所から候補を絞る。</h1>
        <p>登録済み店舗のエリアをまとめ、ランキングと地図へつなげます。</p>
      </section>
      <section className={styles.areaGrid}>
        {areaItems.map(([label, count]) => (
          <Link href={`/areas/${areaSlugForLabel(label)}`} key={label}>
            <span>{count}店</span>
            <strong>{label}</strong>
            <small>このエリアを見る</small>
          </Link>
        ))}
      </section>
    </>
  )
}

export function FeatureIndexView() {
  return (
    <>
      <section className={styles.pageIntro}>
        <p className={styles.kicker}>条件検索</p>
        <h1>今夜の条件から探す。</h1>
        <p>営業中、イベントあり、女性率、昼営業など、判断に使う条件だけを前面に出します。</p>
      </section>
      <section className={styles.areaGrid}>
        {publicConditions.map((condition) => (
          <Link href={`/features/${condition.key}`} key={condition.key}>
            <span>条件</span>
            <strong>{condition.label}</strong>
            <small>この条件で見る</small>
          </Link>
        ))}
      </section>
    </>
  )
}

export function MapExplorerView({ summaries }: { summaries: PublicStoreSummary[] }) {
  return (
    <>
      <section className={styles.pageIntro}>
        <p className={styles.kicker}>地図UI</p>
        <h1>一覧と地図で、移動しやすい候補を見る。</h1>
        <p>住所未登録の店舗も、店名とエリアでGoogle Maps検索へつなげます。</p>
      </section>
      <section className={styles.mapExplorer}>
        <div className={styles.mapCanvas} aria-label="店舗の地図表示">
          {summaries.slice(0, 16).map((summary, index) => (
            <a
              href={summary.mapUrl}
              key={summary.store.id}
              rel="noreferrer"
              style={{
                insetInlineStart: `${12 + (index % 4) * 22}%`,
                insetBlockStart: `${14 + Math.floor(index / 4) * 18}%`,
              }}
              target="_blank"
            >
              <span>{index + 1}</span>
              <strong>{summary.areaLabel}</strong>
            </a>
          ))}
        </div>
        <div className={styles.mapList}>
          {summaries.slice(0, 12).map((summary, index) => (
            <article key={summary.store.id}>
              <span>#{index + 1}</span>
              <div>
                <h2>{formatPublicStoreName(summary.store)}</h2>
                <p>{summary.areaLabel} / {summary.primaryReason}</p>
              </div>
              <a href={summary.mapUrl} target="_blank" rel="noreferrer">
                地図
              </a>
            </article>
          ))}
        </div>
      </section>
    </>
  )
}

export function GuideIndexView({ guides }: { guides: PublicGuide[] }) {
  return (
    <>
      <section className={styles.pageIntro}>
        <p className={styles.kicker}>使い方</p>
        <h1>探すより先に、判断の流れを決める。</h1>
        <p>初心者向けの確認、料金、ルール、今夜の探し方を短くまとめます。</p>
      </section>
      <section className={styles.guideGrid}>
        {guides.map((guide) => (
          <Link href={`/guides/${guide.slug}`} key={guide.slug}>
            <span>Guide</span>
            <h2>{guide.title}</h2>
            <p>{guide.lead}</p>
          </Link>
        ))}
      </section>
    </>
  )
}

export function GuideArticleView({ guide }: { guide: PublicGuide }) {
  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: '使い方', href: '/guides' },
          { name: guide.title, href: `/guides/${guide.slug}` },
        ]}
      />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: guide.faq.map((item) => ({
            '@type': 'Question',
            name: item.question,
            acceptedAnswer: {
              '@type': 'Answer',
              text: item.answer,
            },
          })),
        }}
      />
      <article className={styles.guideArticle}>
        <p className={styles.kicker}>使い方</p>
        <h1>{guide.title}</h1>
        <p>{guide.lead}</p>
        {guide.sections.map((section) => (
          <section key={section.heading}>
            <h2>{section.heading}</h2>
            <p>{section.body}</p>
          </section>
        ))}
        <section>
          <h2>よくある質問</h2>
          {guide.faq.map((item) => (
            <details key={item.question}>
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </section>
      </article>
    </>
  )
}

export function StoreItemListJsonLd({ summaries, path }: { summaries: PublicStoreSummary[]; path: string }) {
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: 'Night Radar 店舗一覧',
        url: publicAbsoluteUrl(path),
        mainEntity: {
          '@type': 'ItemList',
          itemListElement: summaries.slice(0, 50).map((summary, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            url: publicAbsoluteUrl(storeDetailPath(summary.store)),
            name: formatPublicStoreName(summary.store),
          })),
        },
      }}
    />
  )
}

export function resolveConditionLabel(condition?: string) {
  return publicConditions.find((item) => item.key === condition)?.label
}

export function resolveAreaTitle(area?: string) {
  const label = getAreaLabelFromSlug(area)
  return label && label !== '全国' ? `${label}の店舗` : '公開店舗一覧'
}
