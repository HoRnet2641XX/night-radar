'use client'

import { useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import {
  BellRinging,
  Broadcast,
  ChartBarHorizontal,
  ChartLineUp,
  Crosshair,
  EnvelopeSimple,
  FileCsv,
  GlobeHemisphereEast,
  GoogleLogo,
  Lightning,
  ListChecks,
  MagicWand,
  MagnifyingGlass,
  MapPin,
  ShieldCheck,
  Sparkle,
  Storefront,
  StripeLogo,
  Trash,
  UsersThree,
  WarningCircle,
  XLogo,
} from '@phosphor-icons/react'
import { plans } from '@/lib/demo-data'
import { planLimits, planRank } from '@/lib/plans'
import {
  buildStoreBbsAnalytics,
  buildStoreRadarPoints,
  buildVisitForecasts,
  buildWatchedWordHits,
  parseExactTerms,
  searchExactBbsTerms,
  summarizeSignals,
} from '@/lib/scoring'
import type {
  AiAnalysis,
  BbsSnapshot,
  BbsSource,
  CrawlRun,
  DashboardState,
  ExactTermMatch,
  ExactTermState,
  ImportBatch,
  NotificationChannel,
  NotificationJob,
  NotificationPreference,
  PlanKey,
  RuntimeMode,
  ScoredEvent,
  StoreRadarPoint,
  StoreSituation,
  VisitForecast,
  WatchedWordHit,
  WordBookmark,
} from '@/lib/types'
import './night-radar-console.css'

type ApiState = { tone: 'idle' | 'good' | 'warn'; message: string }
type ViewKey = 'radar' | 'analytics' | 'capture' | 'automate' | 'account'

type Props = {
  initialState: DashboardState
}

const navItems: Array<{ key: ViewKey; label: string; icon: ReactNode }> = [
  { key: 'analytics', label: 'Now', icon: <Broadcast size={20} weight="bold" /> },
  { key: 'radar', label: 'Rank', icon: <ChartLineUp size={20} weight="bold" /> },
  { key: 'capture', label: 'Catalog', icon: <Storefront size={20} weight="bold" /> },
  { key: 'account', label: 'Account', icon: <ShieldCheck size={20} weight="bold" /> },
]

const exactTermLabels = {
  popularSingleMale: '人気単男',
  popularSingleFemale: '人気単女',
  negativePerson: '不人気・苦手',
} as const

const planLabels: Record<PlanKey, string> = {
  free: '無料',
  light: 'ライト',
  standard: 'スタンダード',
  premium: 'プレミアム',
}

const paidPlans = plans.filter(
  (plan): plan is (typeof plans)[number] & { key: 'light' | 'standard' | 'premium' } => plan.key !== 'free',
)

const notificationChannelLabels: Record<NotificationChannel, string> = {
  in_app: 'アプリ内',
  email: 'メール',
  webhook: 'Webhook',
}

const situationStatuses: Array<{ value: StoreSituation['status']; label: string }> = [
  { value: 'open', label: '通常営業' },
  { value: 'event', label: 'イベント' },
  { value: 'crowded', label: '盛況' },
  { value: 'watch', label: '要観測' },
  { value: 'closed', label: '休止/不明' },
]

async function postJson<T>(url: string, payload: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const json = await response.json()
  if (!response.ok) throw new Error(json.error ?? 'Request failed')
  return json as T
}

async function deleteJson<T>(url: string, payload: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const json = await response.json()
  if (!response.ok) throw new Error(json.error ?? 'Request failed')
  return json as T
}

export function NightRadarConsole({ initialState }: Props) {
  const initialStores = initialState.stores
  const initialEvents = initialState.events
  const initialPosts = initialState.posts
  const initialScoredEvents = initialState.scoredEvents
  const initialSituations = initialState.situations
  const wordCategories = initialState.wordCategories
  const subscription = initialState.subscription
  const [view, setView] = useState<ViewKey>('analytics')
  const [mode, setMode] = useState<RuntimeMode>(initialState.mode)
  const [stores] = useState(initialStores)
  const [events] = useState(initialEvents)
  const [posts] = useState(initialPosts)
  const [scoredEvents, setScoredEvents] = useState(initialScoredEvents)
  const [situations] = useState(initialSituations)
  const [bbsSources] = useState<BbsSource[]>(initialState.bbsSources)
  const [exactTerms, setExactTerms] = useState<ExactTermState>(initialState.exactTerms)
  const [serverMatches, setServerMatches] = useState<ExactTermMatch[]>([])
  const [analysisText, setAnalysisText] = useState(initialPosts[0]?.body ?? '')
  const [analysis, setAnalysis] = useState<AiAnalysis | null>(null)
  const [email, setEmail] = useState(initialState.userEmail ?? '')
  const [apiState, setApiState] = useState<ApiState>({
    tone: initialState.connectionNote ? 'warn' : 'idle',
    message: initialState.connectionNote ?? (initialState.mode === 'database' ? 'synced' : 'ready'),
  })
  const [jobs, setJobs] = useState<NotificationJob[]>(initialState.notificationJobs)
  const [notificationPreference, setNotificationPreference] = useState<NotificationPreference>(initialState.notificationPreference)
  const [importBatches] = useState<ImportBatch[]>(initialState.importBatches)
  const [crawlRuns] = useState<CrawlRun[]>(initialState.crawlRuns)
  const [bbsSnapshots] = useState<BbsSnapshot[]>(initialState.bbsSnapshots)
  const [wordBookmarks, setWordBookmarks] = useState<WordBookmark[]>(initialState.wordBookmarks)
  const [bookmarkDraft, setBookmarkDraft] = useState('')
  const [busy, setBusy] = useState('')

  const summary = useMemo(() => summarizeSignals(scoredEvents), [scoredEvents])
  const storeAnalytics = useMemo(() => buildStoreBbsAnalytics(stores, posts), [stores, posts])
  const storeRadar = useMemo(() => buildStoreRadarPoints(stores, posts, bbsSnapshots), [stores, posts, bbsSnapshots])
  const watchedWordHits = useMemo(() => buildWatchedWordHits(posts, stores, wordBookmarks), [posts, stores, wordBookmarks])
  const visitForecasts = useMemo(() => buildVisitForecasts(events, stores, posts), [events, stores, posts])
  const exactMatches = useMemo(
    () =>
      searchExactBbsTerms(posts, stores, [
        {
          group: 'popularSingleMale',
          label: exactTermLabels.popularSingleMale,
          terms: parseExactTerms(exactTerms.popularSingleMale),
        },
        {
          group: 'popularSingleFemale',
          label: exactTermLabels.popularSingleFemale,
          terms: parseExactTerms(exactTerms.popularSingleFemale),
        },
        {
          group: 'negativePerson',
          label: exactTermLabels.negativePerson,
          terms: parseExactTerms(exactTerms.negativePerson),
        },
      ]),
    [exactTerms, posts, stores],
  )
  const featuredEvent = summary.dayTop ?? summary.nightTop ?? scoredEvents[0]
  const focusedStores = storeAnalytics.slice(0, 3)
  const visibleSituations = situations.slice(0, 3)
  const visibleMatches = (serverMatches.length ? serverMatches : exactMatches).slice(0, 8)
  const currentPlan = subscription.plan
  const currentLimits = planLimits[currentPlan]
  const visibleImports = importBatches.slice(0, 4)
  const visibleCrawlRuns = crawlRuns.slice(0, 4)
  const visibleWatchedHits = watchedWordHits.slice(0, 8)
  const topForecasts = visitForecasts.slice(0, 3)
  const latestPost = posts[0]
  const hotStore = storeRadar[0]
  const watchStore = storeRadar.find((point) => point.rank > 1 && point.score >= 35) ?? storeRadar[1]
  const latestCaptureLabel = bbsSnapshots.length ? `${bbsSnapshots.length}件` : '巡回待ち'
  const activeWords = wordCategories.filter((word) =>
    posts.some((post) => word.examples.some((example) => post.body.includes(example))),
  )
  const visibleWords = activeWords.length ? activeWords : wordCategories.slice(0, 5)
  const radarScore = featuredEvent?.score ?? 0
  const modeLabel = mode === 'database' ? 'DB保存中' : mode === 'anonymous' ? 'ログイン待ち' : 'デモ'
  const busyLabel = busy ? '処理中…' : apiState.message === modeLabel ? '待機中' : apiState.message
  const sourceLimitLabel = `${bbsSources.length}件`
  const isSignedIn = Boolean(initialState.userEmail)

  function flash(message: string, tone: ApiState['tone'] = 'good') {
    setApiState({ message, tone })
  }

  function applyMode(nextMode?: RuntimeMode, message?: string) {
    if (nextMode) setMode(nextMode)
    if (message) flash(message, nextMode === 'database' ? 'good' : 'warn')
  }

  async function runScoring() {
    setBusy('score')
    try {
      const result = await postJson<{ scoredEvents: ScoredEvent[]; mode?: RuntimeMode; saved?: number }>(
        '/api/score',
        { stores, events, posts, snapshot: true },
      )
      setScoredEvents(result.scoredEvents)
      flash('スコアを再計算しました。')
    } catch (error) {
      flash(error instanceof Error ? error.message : 'スコア算出に失敗しました。', 'warn')
    } finally {
      setBusy('')
    }
  }

  async function runAiAnalysis() {
    if (!analysisText.trim()) return flash('AI分析するテキストが必要です。', 'warn')
    setBusy('ai')
    try {
      const result = await postJson<{ analysis: AiAnalysis; mode: string }>('/api/ai/analyze', { text: analysisText, persist: true })
      setAnalysis(result.analysis)
      flash(`AI分析を完了しました (${result.mode})。`)
    } catch (error) {
      flash(error instanceof Error ? error.message : 'AI分析に失敗しました。', 'warn')
    } finally {
      setBusy('')
    }
  }

  async function addWordBookmark(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const pattern = bookmarkDraft.trim()
    if (!pattern) return flash('保存するワードが必要です。', 'warn')

    setBusy('word-bookmark')
    try {
      const result = await postJson<{ bookmark: WordBookmark; mode?: RuntimeMode; message?: string }>('/api/word-bookmarks', {
        label: pattern,
        pattern,
        matchType: 'exact',
      })
      setWordBookmarks((current) => [result.bookmark, ...current.filter((bookmark) => bookmark.id !== result.bookmark.id)])
      setBookmarkDraft('')
      applyMode(result.mode, result.message)
      if (!result.message) flash('ワードをブックマークしました。')
    } catch (error) {
      flash(error instanceof Error ? error.message : 'ワードを保存できません。', 'warn')
    } finally {
      setBusy('')
    }
  }

  async function deleteWordBookmark(id: string) {
    setBusy('delete-word-bookmark')
    try {
      const result = await deleteJson<{ mode?: RuntimeMode; message?: string }>('/api/word-bookmarks', { id })
      setWordBookmarks((current) => current.filter((bookmark) => bookmark.id !== id))
      applyMode(result.mode, result.message)
      if (!result.message) flash('ワードブックマークを削除しました。')
    } catch (error) {
      flash(error instanceof Error ? error.message : 'ワードブックマークを削除できません。', 'warn')
    } finally {
      setBusy('')
    }
  }

  async function saveExactTerms() {
    if (mode === 'database') {
      const overLimit = Object.entries(exactTerms).find(([, value]) => parseExactTerms(value).length > currentLimits.exactTermsPerGroup)
      if (overLimit) return flash(`${planLabels[currentPlan]}プランの完全一致ワード上限は各${currentLimits.exactTermsPerGroup}件です。`, 'warn')
    }
    setBusy('exact')
    try {
      const result = await postJson<{
        mode?: RuntimeMode
        message?: string
        matches: ExactTermMatch[]
        exactTerms: ExactTermState
      }>('/api/search/exact', {
        exactTerms,
        stores,
        posts,
      })
      setExactTerms(result.exactTerms)
      setServerMatches(result.matches)
      applyMode(result.mode, result.message)
      flash(`${result.matches.length}件の完全一致を保存/検索しました。`)
    } catch (error) {
      flash(error instanceof Error ? error.message : '完全一致検索に失敗しました。', 'warn')
    } finally {
      setBusy('')
    }
  }

  async function sendNotifications() {
    setBusy('notify')
    try {
      const result = await postJson<{
        jobs: NotificationJob[]
        mode?: RuntimeMode
        message?: string
        preference?: NotificationPreference
      }>('/api/notifications/dispatch', {
        channel: notificationPreference.channel,
        audience: notificationPreference.audience,
        recipient: notificationPreference.email || undefined,
        webhookUrl: notificationPreference.webhookUrl || undefined,
        events: scoredEvents,
      })
      setJobs(result.jobs)
      if (result.preference) setNotificationPreference(result.preference)
      applyMode(result.mode, result.message)
      if (!result.message) flash('通知ジョブを作成しました。')
    } catch (error) {
      flash(error instanceof Error ? error.message : '通知配信に失敗しました。', 'warn')
    } finally {
      setBusy('')
    }
  }

  async function saveNotificationSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (notificationPreference.channel === 'email' && !notificationPreference.email) {
      return flash('メール通知には送信先メールが必要です。', 'warn')
    }
    if (notificationPreference.channel === 'webhook' && !notificationPreference.webhookUrl) {
      return flash('Webhook通知にはURLが必要です。', 'warn')
    }

    setBusy('notification-settings')
    try {
      const result = await postJson<{
        preference: NotificationPreference
        mode?: RuntimeMode
        message?: string
      }>('/api/notifications/preferences', notificationPreference)
      setNotificationPreference(result.preference)
      applyMode(result.mode, result.message)
      if (!result.message) flash('通知設定を保存しました。')
    } catch (error) {
      flash(error instanceof Error ? error.message : '通知設定を保存できません。', 'warn')
    } finally {
      setBusy('')
    }
  }

  async function startOAuth(provider: 'google' | 'x') {
    setBusy(provider)
    try {
      const result = await postJson<{ url: string; mode?: string; message?: string }>('/api/auth/oauth', { provider })
      if (result.mode === 'demo') {
        flash(result.message ?? '認証はデモモードです。', 'warn')
      } else if (result.url) {
        window.location.assign(result.url)
      }
    } catch (error) {
      flash(error instanceof Error ? error.message : 'OAuth開始に失敗しました。', 'warn')
    } finally {
      setBusy('')
    }
  }

  async function sendEmailLink() {
    if (!email) return flash('メールアドレスを入力してください。', 'warn')
    setBusy('email')
    try {
      const result = await postJson<{ mode?: string; message?: string }>('/api/auth/email', { email })
      flash(result.message ?? '認証メールを送信しました。', result.mode === 'demo' ? 'warn' : 'good')
    } catch (error) {
      flash(error instanceof Error ? error.message : 'メール認証に失敗しました。', 'warn')
    } finally {
      setBusy('')
    }
  }

  async function checkout(plan: 'light' | 'standard' | 'premium') {
    setBusy(`checkout-${plan}`)
    try {
      const result = await postJson<{ url: string; mode?: string; message?: string }>('/api/stripe/checkout', { plan })
      if (result.mode === 'demo') {
        flash(result.message ?? 'Stripeはデモモードです。', 'warn')
      } else if (result.url) {
        window.location.assign(result.url)
      }
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Checkoutを開始できません。', 'warn')
    } finally {
      setBusy('')
    }
  }

  async function openBillingPortal() {
    setBusy('portal')
    try {
      const result = await postJson<{ url: string; mode?: string; message?: string }>('/api/stripe/portal', {})
      if (result.mode === 'demo') {
        flash(result.message ?? 'Stripeはデモモードです。', 'warn')
      } else if (result.url) {
        window.location.assign(result.url)
      }
    } catch (error) {
      flash(error instanceof Error ? error.message : '請求ポータルを開けません。', 'warn')
    } finally {
      setBusy('')
    }
  }

  async function signOut() {
    setBusy('signout')
    try {
      await postJson<{ ok: boolean }>('/api/auth/signout', {})
      window.location.assign('/')
    } catch (error) {
      flash(error instanceof Error ? error.message : 'ログアウトできません。', 'warn')
    } finally {
      setBusy('')
    }
  }

  return (
    <main className="nr-shell" id="main">
      <section className="mobile-app-shell">
        <header className="app-topbar">
          <button className="brand-chip" type="button" onClick={() => setView('analytics')} aria-label="BBSへ戻る">
            <Crosshair size={18} weight="bold" />
            <span>Night Radar</span>
          </button>
          <div className="status-cluster">
            <StatusPill icon={<ShieldCheck size={16} weight="bold" />} label={modeLabel} tone={mode === 'database' ? 'good' : 'warn'} />
            <StatusPill icon={<Lightning size={16} weight="bold" />} label={busyLabel} tone={busy ? 'warn' : apiState.tone} />
          </div>
        </header>

        {view === 'radar' && (
          <section className="view-stack">
            <section className="radar-hero-card">
              <div className="radar-copy">
                <span>Ranking</span>
                <h1>来店予告ランキング</h1>
                <p>{featuredEvent?.reasons[0] ?? '公開情報を入れると、昼夜の候補がここに立ち上がります。'}</p>
              </div>
              <div className="radar-orbit" aria-label={`公開シグナル期待度 ${radarScore}`}>
                <i />
                <i />
                <i />
                <strong>{radarScore || '--'}</strong>
                <span>score</span>
              </div>
            </section>

            <section className="signal-carousel" aria-label="本日のシグナル">
              <SignalTile label="昼" event={summary.dayTop} time="12:30" />
              <SignalTile label="夜" event={summary.nightTop} time="18:30" />
            </section>

            <section className="quick-actions" aria-label="主要操作">
              <ActionButton icon={<ChartLineUp size={20} weight="bold" />} label="再計算" onClick={runScoring} disabled={busy === 'score'} />
              <ActionButton icon={<ChartBarHorizontal size={20} weight="bold" />} label="Now" onClick={() => setView('analytics')} />
              <ActionButton icon={<Storefront size={20} weight="bold" />} label="店舗" onClick={() => setView('capture')} />
              <ActionButton icon={<MagnifyingGlass size={20} weight="bold" />} label="検索" onClick={() => setView('analytics')} />
            </section>

            <section className="insight-card">
              <div className="section-heading">
                <span>Word radar</span>
                <h2>反応中の嗜好ワード</h2>
              </div>
              <div className="word-cloud">
                {visibleWords.map((word) => (
                  <span key={word.id}>
                    {word.label}
                    <em>{word.hits}</em>
                  </span>
                ))}
              </div>
            </section>

            <section className="score-list-card">
              <div className="section-heading">
                <span>Ranking</span>
                <h2>候補リスト</h2>
              </div>
              <div className="score-list">
                {scoredEvents.slice(0, 5).map((event) => (
                  <ScoreRow event={event} key={event.id} />
                ))}
              </div>
            </section>

            <LatestPost source={latestPost?.source ?? 'manual'} body={latestPost?.body ?? 'まだ投稿がありません。'} />
          </section>
        )}

        {view === 'analytics' && (
          <section className="view-stack">
            <ViewIntro
              eyebrow="BBS monitor"
              title="BBSモニター"
              body="店舗別の反応、来店予告、監視ワードを一覧します。"
            />

            <DecisionDock hotStore={hotStore} watchStore={watchStore} latestCaptureLabel={latestCaptureLabel} />

            <RadarBoard points={storeRadar} />

            <section className="subpage-strip" aria-label="詳細ページ">
              <a href="/forecast">来店予告ランキング</a>
              <a href="/calendar">月間イベント</a>
            </section>

            <WatchedWordsPanel
              hits={visibleWatchedHits}
              bookmarks={wordBookmarks}
              bookmarkDraft={bookmarkDraft}
              busy={busy}
              onDraftChange={setBookmarkDraft}
              onAddBookmark={addWordBookmark}
              onDeleteBookmark={deleteWordBookmark}
            />

            <ForecastPreview forecasts={topForecasts} />

            <section className="app-card form-card compact-search-card">
              <FormTitle icon={<MagnifyingGlass size={19} weight="bold" />} title="全店BBS 完全一致" />
              <div className="term-grid">
                <label>
                  <span>人気単男</span>
                  <input
                    autoComplete="off"
                    name="popularSingleMale"
                    spellCheck={false}
                    value={exactTerms.popularSingleMale}
                    onChange={(event) => setExactTerms((current) => ({ ...current, popularSingleMale: event.target.value }))}
                  />
                </label>
                <label>
                  <span>人気単女</span>
                  <input
                    autoComplete="off"
                    name="popularSingleFemale"
                    spellCheck={false}
                    value={exactTerms.popularSingleFemale}
                    onChange={(event) => setExactTerms((current) => ({ ...current, popularSingleFemale: event.target.value }))}
                  />
                </label>
                <label>
                  <span>不人気・苦手</span>
                  <input
                    autoComplete="off"
                    name="negativePerson"
                    spellCheck={false}
                    value={exactTerms.negativePerson}
                    onChange={(event) => setExactTerms((current) => ({ ...current, negativePerson: event.target.value }))}
                  />
                </label>
              </div>
              <button type="button" onClick={saveExactTerms} disabled={busy === 'exact'}>
                <MagnifyingGlass size={17} weight="bold" />
                検索して保存
              </button>
              <ExactMatchList matches={visibleMatches} />
            </section>

            <section className="app-card">
              <div className="section-heading">
                <span>Weekday</span>
                <h2>曜日</h2>
              </div>
              <div className="weekday-matrix">
                {focusedStores.map((item) => (
                  <article className="weekday-row" key={item.store.id}>
                    <div>
                      <strong>{item.store.name}</strong>
                      <span>{item.dominantWeekday}が最多</span>
                    </div>
                    <div className="weekday-bars">
                      {item.weekdayStats.map((stat) => (
                        <span className="weekday-bar" key={stat.weekday}>
                          <i style={{ blockSize: `${Math.max(6, stat.ratio)}%` }} />
                          <em>{stat.weekday.replace('曜', '')}</em>
                        </span>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="app-card form-card">
              <FormTitle icon={<MapPin size={19} weight="bold" />} title="店舗状況" />
              <div className="situation-list">
                {visibleSituations.length ? (
                  visibleSituations.map((situation) => (
                    <SituationCard
                      key={situation.id}
                      situation={situation}
                      storeName={stores.find((store) => store.id === situation.storeId)?.name ?? '未登録店舗'}
                    />
                  ))
                ) : (
                  <p className="muted-note">運営側の観測メモが入ると表示されます。</p>
                )}
              </div>
            </section>
          </section>
        )}

        {view === 'capture' && (
          <section className="view-stack">
            <ViewIntro eyebrow="Catalog" title="店舗・巡回先" body="店舗、イベント、BBSソースは運営側で更新します。" />

            <OpsPanel
              mode={mode}
              sourceLimitLabel={sourceLimitLabel}
              crawlRuns={visibleCrawlRuns}
              importBatches={visibleImports}
              jobs={jobs}
            />

            <section className="app-card catalog-card">
              <div className="section-heading">
                <span>Stores</span>
                <h2>登録店舗</h2>
              </div>
              <div className="catalog-list">
                {stores.length ? (
                  stores.slice(0, 12).map((store) => (
                    <article key={store.id}>
                      <div>
                        <strong>{store.name}</strong>
                        <span>
                          {store.area} / {storeSessionLabel(store)}
                        </span>
                      </div>
                      <em>{store.trustSeed}</em>
                    </article>
                  ))
                ) : (
                  <p className="muted-note">運営側で店舗マスタを投入すると表示されます。</p>
                )}
              </div>
            </section>

            <section className="app-card catalog-card">
              <div className="section-heading">
                <span>BBS sources</span>
                <h2>巡回対象</h2>
              </div>
              <div className="source-list">
                {bbsSources.length ? (
                  bbsSources.slice(0, 10).map((source) => (
                    <article key={source.id}>
                      <div>
                        <strong>{source.label}</strong>
                        <span>
                          {stores.find((store) => store.id === source.storeId)?.name ?? '未登録'} / {source.lastStatus ?? 'pending'}
                        </span>
                      </div>
                      <em>{source.crawlIntervalMinutes}分</em>
                    </article>
                  ))
                ) : (
                  <p className="muted-note">BBS URLは管理側のCSV/SQLで追加します。</p>
                )}
              </div>
              <CrawlRunList runs={visibleCrawlRuns} />
            </section>

            <section className="app-card catalog-card">
              <div className="section-heading">
                <span>Events</span>
                <h2>月間イベント</h2>
              </div>
              <div className="score-list">
                {events.slice(0, 8).map((event) => (
                  <article className="score-row" key={event.id}>
                    <div>
                      <strong>{event.title}</strong>
                      <small>
                        {stores.find((store) => store.id === event.storeId)?.name ?? '未登録'} / {event.date} {event.startsAt}
                      </small>
                    </div>
                    <em>{event.session === 'day' ? '昼' : '夜'}</em>
                  </article>
                ))}
              </div>
              <a className="text-action" href="/calendar">
                カレンダーを見る
              </a>
            </section>
          </section>
        )}

        {view === 'automate' && (
          <section className="view-stack">
            <ViewIntro eyebrow="Flow" title="分析・通知" body="店舗/BBSデータは運営側で巡回し、ユーザーは分析と通知設定を扱います。" />

            <section className="app-card form-card">
              <FormTitle icon={<MagicWand size={19} weight="bold" />} title="AI分析" />
              <textarea aria-label="AI分析対象テキスト" name="analysisText" value={analysisText} onChange={(event) => setAnalysisText(event.target.value)} rows={5} />
              <button type="button" onClick={runAiAnalysis} disabled={busy === 'ai'}>
                <Sparkle size={17} weight="fill" />
                分類する
              </button>
              {analysis && (
                <div className="analysis-result">
                  <strong>
                    {analysis.eventCategory} / {analysis.session === 'day' ? '昼' : '夜'}
                  </strong>
                  <p>{analysis.summary}</p>
                  <small>具体性 {analysis.specificity} / {analysis.keywords.join('、') || 'キーワードなし'}</small>
                </div>
              )}
            </section>

            <section className="app-card form-card">
              <FormTitle icon={<BellRinging size={19} weight="bold" />} title="通知配信" />
              <form className="nested-form" onSubmit={saveNotificationSettings}>
                <div className="inline-grid">
                  <select
                    aria-label="通知チャンネル"
                    value={notificationPreference.channel}
                    onChange={(event) =>
                      setNotificationPreference((current) => ({
                        ...current,
                        channel: event.target.value as NotificationChannel,
                      }))
                    }
                  >
                    <option value="in_app">アプリ内</option>
                    <option value="email">メール</option>
                    <option value="webhook">Webhook</option>
                  </select>
                  <select
                    aria-label="通知対象プラン"
                    value={notificationPreference.audience}
                    onChange={(event) =>
                      setNotificationPreference((current) => ({
                        ...current,
                        audience: event.target.value as PlanKey,
                      }))
                    }
                  >
                    {plans.map((plan) => (
                      <option key={plan.key} value={plan.key} disabled={mode === 'database' && planRank[plan.key] > planRank[currentPlan]}>
                        {plan.label}
                      </option>
                    ))}
                  </select>
                </div>
                <input
                  aria-label="通知メール"
                  autoComplete="email"
                  name="notificationEmail"
                  placeholder="通知メール…"
                  type="email"
                  value={notificationPreference.email}
                  onChange={(event) => setNotificationPreference((current) => ({ ...current, email: event.target.value }))}
                />
                <input
                  aria-label="Webhook URL"
                  autoComplete="off"
                  name="notificationWebhookUrl"
                  placeholder="Webhook URL…"
                  type="url"
                  value={notificationPreference.webhookUrl}
                  onChange={(event) => setNotificationPreference((current) => ({ ...current, webhookUrl: event.target.value }))}
                />
                <button className="secondary-action" type="submit" disabled={busy === 'notification-settings'}>
                  <BellRinging size={17} weight="bold" />
                  通知設定を保存
                </button>
              </form>
              <NotificationPreferenceSummary preference={notificationPreference} />
              <button type="button" onClick={sendNotifications} disabled={busy === 'notify'}>
                <BellRinging size={17} weight="bold" />
                通知ジョブを作成
              </button>
              <div className="job-list">
                {jobs.length ? (
                  jobs.map((job) => (
                    <article key={job.id}>
                      <strong>{job.title}</strong>
                      <span>
                        {job.channel} / {job.status}
                      </span>
                    </article>
                  ))
                ) : (
                  <p className="muted-note">ResendまたはWebhook未設定時はdry-runとしてジョブだけ作成します。</p>
                )}
              </div>
            </section>
          </section>
        )}

        {view === 'account' && (
          <section className="view-stack">
            <ViewIntro eyebrow="Account" title="アカウント" body="ログイン、支払い、公開情報ポリシーを管理します。" />

            <section className="app-card form-card">
              <FormTitle icon={<ShieldCheck size={19} weight="bold" />} title="認証" />
              <div className="account-state">
                <span>{initialState.userEmail ? initialState.userEmail : '未ログイン'}</span>
                <strong>{planLabels[subscription.plan]} / {subscription.status}</strong>
              </div>
              <button type="button" onClick={() => startOAuth('x')} disabled={busy === 'x'}>
                <XLogo size={19} weight="bold" />
                Xで続ける
              </button>
              <button className="secondary-action" type="button" onClick={() => startOAuth('google')} disabled={busy === 'google'}>
                <GoogleLogo size={19} weight="bold" />
                Googleで続ける
              </button>
              <label className="email-row">
                <EnvelopeSimple size={18} weight="bold" />
                <input
                  aria-label="メールアドレス"
                  autoComplete="email"
                  name="email"
                  placeholder="メールアドレス…"
                  spellCheck={false}
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
              <button type="button" onClick={sendEmailLink} disabled={busy === 'email'}>
                認証メールを送る
              </button>
              {initialState.userEmail && (
                <button className="secondary-action" type="button" onClick={signOut} disabled={busy === 'signout'}>
                  ログアウト
                </button>
              )}
            </section>

            <section className="app-card billing-panel">
              <div className="billing-head">
                <FormTitle icon={<StripeLogo size={19} weight="bold" />} title="支払い・プラン" />
                <span>{planLabels[currentPlan]}プラン</span>
              </div>
              <div className="billing-route" aria-label="決済開始ルート">
                <span>Account</span>
                <span>Plan</span>
                <span>Stripe</span>
              </div>
              <section className="plan-stack">
                {paidPlans.map((plan) => (
                  <button
                    className={`plan-card ${subscription.plan === plan.key ? 'is-current' : ''}`}
                    disabled={!isSignedIn || busy === `checkout-${plan.key}`}
                    key={plan.key}
                    type="button"
                    onClick={() => checkout(plan.key)}
                  >
                    <span>
                      <StripeLogo size={20} weight="bold" />
                      {plan.label}
                      {subscription.plan === plan.key ? <em>現在</em> : null}
                    </span>
                    <strong>{plan.price}</strong>
                    <small>{plan.summary}</small>
                    <small>
                      BBS {planLimits[plan.key].bbsSources}件 / 完全一致 各{planLimits[plan.key].exactTermsPerGroup}語
                    </small>
                    <small>{isSignedIn ? 'Stripe Checkoutへ進む' : 'ログイン後に開始'}</small>
                  </button>
                ))}
              </section>

              <button className="billing-portal-button" type="button" onClick={openBillingPortal} disabled={!isSignedIn || busy === 'portal'}>
                <StripeLogo size={18} weight="bold" />
                請求ポータルを開く
              </button>
            </section>

            <section className="legal-note">
              <WarningCircle size={18} weight="bold" />
              <p>
                本サービスは公開情報の店舗・イベント単位集計です。個人追跡、来店保証、違法行為の助長は扱いません。
                <a href="/terms">利用規約</a>
                <a href="/privacy">プライバシー</a>
              </p>
            </section>
          </section>
        )}

        <nav className="bottom-nav" aria-label="主要ナビゲーション">
          {navItems.map((item) => (
            <button
              aria-pressed={view === item.key}
              className={view === item.key ? 'is-active' : ''}
              key={item.key}
              type="button"
              onClick={() => setView(item.key)}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </section>
    </main>
  )
}

function StatusPill({ icon, label, tone = 'idle' }: { icon: ReactNode; label: string; tone?: ApiState['tone'] }) {
  return (
    <span aria-live="polite" className={`status-pill ${tone}`}>
      {icon}
      {label}
    </span>
  )
}

function ViewIntro({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <section className="view-intro">
      <span>{eyebrow}</span>
      <h1>{title}</h1>
      <p>{body}</p>
    </section>
  )
}

function FormTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="form-title">
      {icon}
      <h2>{title}</h2>
    </div>
  )
}

function ActionButton({ icon, label, onClick, disabled = false }: { icon: ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}>
      {icon}
      <span>{label}</span>
    </button>
  )
}

function DecisionDock({
  hotStore,
  watchStore,
  latestCaptureLabel,
}: {
  hotStore?: StoreRadarPoint
  watchStore?: StoreRadarPoint
  latestCaptureLabel: string
}) {
  return (
    <section className="decision-dock" aria-label="現在の判断サマリー">
      <article className="decision-primary">
        <span>Hot</span>
        <strong>{hotStore?.store.name ?? '観測待ち'}</strong>
        <p>{hotStore ? `${hotStore.verdict} / 女性${hotStore.signals.femaleOnly} 初${hotStore.signals.firstVisit}` : 'BBS巡回後に判定が出ます。'}</p>
      </article>
      <article>
        <span>余地</span>
        <strong>{watchStore?.store.name ?? '-'}</strong>
        <p>{watchStore ? `${watchStore.score}pt / ${watchStore.verdict}` : '比較対象なし'}</p>
      </article>
      <article>
        <span>巡回</span>
        <strong>{latestCaptureLabel}</strong>
        <p>5分間隔でBBSを観測</p>
      </article>
    </section>
  )
}

function SignalTile({ label, event, time }: { label: string; event?: ScoredEvent; time: string }) {
  return (
    <article className={`signal-tile ${event?.tone ?? 'quiet'}`}>
      <span className="tile-icon">
        <Lightning size={21} weight="duotone" />
      </span>
      <div>
        <p>
          {time} {label}
        </p>
        <strong>{event ? `${event.store.name} / ${event.title}` : '未計算'}</strong>
        <small>{event?.reasons[0] ?? 'データを追加すると表示されます'}</small>
      </div>
      <em>{event?.score ?? '-'}</em>
    </article>
  )
}

function ScoreRow({ event }: { event: ScoredEvent }) {
  return (
    <article className={`score-row ${event.tone}`}>
      <span>{event.rank}</span>
      <div>
        <strong>
          {event.store.name} / {event.title}
        </strong>
        <small>
          {event.date} {event.startsAt} / {event.reasons.join('、')}
        </small>
      </div>
      <em>{event.score}</em>
    </article>
  )
}

function RadarBoard({ points }: { points: StoreRadarPoint[] }) {
  const top = points[0]

  return (
    <section className="radar-board app-card" aria-label="店舗レーダー">
      <div className="radar-board-head">
        <div>
          <span>Store radar</span>
          <h2>{top ? `${top.store.name} が現在Hot` : 'BBS未観測'}</h2>
        </div>
        <strong>{top?.score ?? 0}</strong>
      </div>
      <div className="radar-board-grid">
        <StoreShareDonut points={points.slice(0, 5)} />
        <div className="vertical-radar">
          {points.slice(0, 5).map((point) => (
            <article
              className={`radar-store-row ${point.tone}`}
              key={point.store.id}
            >
              <div className="radar-store-rank">{point.rank}</div>
              <div className="radar-store-main">
                <div>
                  <strong>{point.store.name}</strong>
                  <span>
                    {point.verdict} / 女性{point.signals.femaleOnly} 初{point.signals.firstVisit} 複{point.signals.groupVisit}
                  </span>
                </div>
                <div className="radar-meter" aria-label={`${point.store.name} ${point.score}`}>
                  <i style={{ inlineSize: `${Math.max(8, point.score)}%` }} />
                </div>
              </div>
              <em>{point.score}</em>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function StoreShareDonut({ points }: { points: StoreRadarPoint[] }) {
  const radius = 38
  const circumference = 2 * Math.PI * radius
  const total = Math.max(1, points.reduce((sum, point) => sum + point.score, 0))
  const segments = points.reduce<Array<{ point: StoreRadarPoint; length: number; offset: number }>>((items, point) => {
    const previous = items.reduce((sum, item) => sum + item.length, 0)
    return [
      ...items,
      {
        point,
        length: (point.score / total) * circumference,
        offset: previous,
      },
    ]
  }, [])

  return (
    <div className="share-donut">
      <svg viewBox="0 0 104 104" role="img" aria-label="店舗別Hot比率">
        <circle className="donut-base" cx="52" cy="52" r={radius} />
        {segments.map(({ point, length, offset }, index) => {
          const strokeDasharray = `${length} ${circumference - length}`
          const strokeDashoffset = -offset
          const segmentStyle = {
            '--donut-length': `${length}`,
            '--donut-gap': `${circumference - length}`,
            '--donut-offset': `${strokeDashoffset}`,
            '--donut-trace': `${circumference}`,
            '--donut-delay': `${index * 110}ms`,
            '--donut-pulse-delay': `${900 + index * 110}ms`,
          } as CSSProperties

          return (
            <circle
              className={`donut-segment ${point.tone}`}
              cx="52"
              cy="52"
              key={point.store.id}
              r={radius}
              strokeDasharray={strokeDasharray}
              strokeDashoffset={strokeDashoffset}
              style={segmentStyle}
            />
          )
        })}
      </svg>
      <div>
        <strong>{points[0]?.share ?? 0}%</strong>
        <span>{points[0]?.store.name ?? '未観測'}</span>
      </div>
    </div>
  )
}

function WatchedWordsPanel({
  hits,
  bookmarks,
  bookmarkDraft,
  busy,
  onDraftChange,
  onAddBookmark,
  onDeleteBookmark,
}: {
  hits: WatchedWordHit[]
  bookmarks: WordBookmark[]
  bookmarkDraft: string
  busy: string
  onDraftChange: (value: string) => void
  onAddBookmark: (event: FormEvent<HTMLFormElement>) => void
  onDeleteBookmark: (id: string) => void
}) {
  return (
    <section className="app-card watched-card">
      <div className="section-heading">
        <span>Watch words</span>
        <h2>注目ワード</h2>
      </div>
      <div className="watch-word-chips" aria-label="固定監視ワード">
        <span>女性</span>
        <span>初めて</span>
        <span>久しぶり</span>
        <span>2人組</span>
        <span>絵文字</span>
      </div>
      <form className="bookmark-form" onSubmit={onAddBookmark}>
        <input
          aria-label="ブックマークワード"
          autoComplete="off"
          name="bookmarkWord"
          placeholder="追加ワード…"
          value={bookmarkDraft}
          onChange={(event) => onDraftChange(event.target.value)}
        />
        <button type="submit" disabled={busy === 'word-bookmark'}>
          保存
        </button>
      </form>
      {bookmarks.length ? (
        <div className="bookmark-list">
          {bookmarks.slice(0, 8).map((bookmark) => (
            <button type="button" key={bookmark.id} onClick={() => onDeleteBookmark(bookmark.id)}>
              {bookmark.label}
              <Trash size={13} weight="bold" />
            </button>
          ))}
        </div>
      ) : null}
      <div className="watch-hit-list">
        {hits.length ? (
          hits.map((hit) => (
            <article className={`watch-hit ${hit.severity}`} key={hit.id}>
              <span>{hit.label}</span>
              <strong>{hit.store.name}</strong>
              <p>{hit.snippet}</p>
            </article>
          ))
        ) : (
          <p className="muted-note">BBS投稿を取り込むと、注目ワードがここに出ます。</p>
        )}
      </div>
    </section>
  )
}

function ForecastPreview({ forecasts }: { forecasts: VisitForecast[] }) {
  return (
    <section className="app-card forecast-preview">
      <div className="section-heading">
        <span>Arrival forecast</span>
        <h2>来店予告Top3</h2>
      </div>
      <div className="forecast-list-mini">
        {forecasts.length ? (
          forecasts.map((forecast) => (
            <article key={forecast.id}>
              <span>{forecast.rank}</span>
              <div>
                <strong>{forecast.store.name}</strong>
                <small>
                  {forecast.dateLabel} {forecast.timeLabel} / {forecast.reasons[0]}
                </small>
              </div>
              <em>{forecast.score}</em>
            </article>
          ))
        ) : (
          <p className="muted-note">イベントとBBS投稿を追加するとランキングが出ます。</p>
        )}
      </div>
      <a className="text-action" href="/forecast">
        ランキングを見る
      </a>
    </section>
  )
}

function formatShortDate(value?: string) {
  if (!value) return '未実行'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function hostLabel(value: string) {
  try {
    return new URL(value).hostname
  } catch {
    return value
  }
}

function storeSessionLabel(store: { hasDaytime: boolean; hasNight: boolean }) {
  const sessions = [store.hasDaytime ? '昼' : '', store.hasNight ? '夜' : ''].filter(Boolean)
  return sessions.length ? sessions.join('・') : '時間未設定'
}

function OpsPanel({
  mode,
  sourceLimitLabel,
  crawlRuns,
  importBatches,
  jobs,
}: {
  mode: RuntimeMode
  sourceLimitLabel: string
  crawlRuns: CrawlRun[]
  importBatches: ImportBatch[]
  jobs: NotificationJob[]
}) {
  const latestRun = crawlRuns[0]
  const latestImport = importBatches[0]
  const failedJobs = jobs.filter((job) => job.status === 'failed').length

  return (
    <section className="ops-panel app-card" aria-label="運用状態">
      <div className="ops-tile">
        <ShieldCheck size={17} weight="bold" />
        <span>保存</span>
        <strong>{mode === 'database' ? 'DB' : mode === 'anonymous' ? 'ログイン待ち' : 'デモ'}</strong>
      </div>
      <div className="ops-tile">
        <Broadcast size={17} weight="bold" />
        <span>BBS</span>
        <strong>{sourceLimitLabel}</strong>
      </div>
      <div className="ops-tile">
        <GlobeHemisphereEast size={17} weight="bold" />
        <span>巡回</span>
        <strong>{latestRun ? latestRun.status : '未実行'}</strong>
      </div>
      <div className="ops-tile">
        <FileCsv size={17} weight="bold" />
        <span>取込</span>
        <strong>{latestImport ? latestImport.importedCount : 0}</strong>
      </div>
      {failedJobs ? <p className="ops-note">通知失敗 {failedJobs}件</p> : null}
    </section>
  )
}

function CrawlRunList({ runs }: { runs: CrawlRun[] }) {
  if (!runs.length) return null

  return (
    <div className="mini-history" aria-label="BBS巡回履歴">
      {runs.map((run) => (
        <article key={run.id}>
          <span>{run.status}</span>
          <strong>{run.message ?? hostLabel(run.url)}</strong>
          <em>{formatShortDate(run.fetchedAt)}</em>
        </article>
      ))}
    </div>
  )
}

function NotificationPreferenceSummary({ preference }: { preference: NotificationPreference }) {
  const destination =
    preference.channel === 'email'
      ? preference.email || '未設定'
      : preference.channel === 'webhook'
        ? preference.webhookUrl || '未設定'
        : 'アプリ内'

  return (
    <div className="preference-summary">
      <span>{notificationChannelLabels[preference.channel]}</span>
      <strong>{destination}</strong>
      <em>{planLabels[preference.audience]}向け</em>
    </div>
  )
}

function SituationCard({
  situation,
  storeName,
}: {
  situation: StoreSituation
  storeName: string
}) {
  const statusLabel = situationStatuses.find((status) => status.value === situation.status)?.label ?? '要観測'

  return (
    <article className={`situation-card ${situation.status}`}>
      <div>
        <span>
          <ListChecks size={16} weight="bold" />
          {storeName} / {statusLabel}
        </span>
        <strong>{situation.title}</strong>
        <p>{situation.note || 'メモなし'}</p>
      </div>
    </article>
  )
}

function ExactMatchList({ matches }: { matches: ExactTermMatch[] }) {
  if (!matches.length) {
    return (
      <div className="empty-result">
        <UsersThree size={18} weight="bold" />
        <span>完全一致の該当はありません。</span>
      </div>
    )
  }

  return (
    <div className="match-list">
      {matches.slice(0, 16).map((match) => (
        <article className={`match-card ${match.group}`} key={match.id}>
          <div>
            <span>{match.groupLabel}</span>
            <strong>{match.term}</strong>
          </div>
          <p>
            {match.store.name} / {match.snippet}
          </p>
        </article>
      ))}
    </div>
  )
}

function LatestPost({ source, body }: { source: string; body: string }) {
  return (
    <section className="latest-card">
      <div className="section-heading">
        <span>Latest intake</span>
        <h2>直近の観測ログ</h2>
      </div>
      <div className="log-ribbon">
        <span>{source}</span>
        <p>{body}</p>
      </div>
    </section>
  )
}
