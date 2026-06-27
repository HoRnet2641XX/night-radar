'use client'

import { useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import {
  BellRinging,
  Broadcast,
  CalendarDots,
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
  buildSearchableBbsRecords,
  buildVisitForecasts,
  buildWatchedWordHits,
  parseExactTerms,
  searchExactBbsTerms,
  summarizeSignals,
} from '@/lib/scoring'
import { formatBarName, formatStoreArea, formatStoreSessionLabel } from '@/lib/display'
import type {
  AiAnalysis,
  BbsSnapshot,
  BbsSource,
  CrawlRun,
  DashboardState,
  ExactTermMatch,
  ExactTermGroup,
  ExactTermState,
  EventInput,
  ImportBatch,
  NotificationChannel,
  NotificationJob,
  NotificationPreference,
  PlanKey,
  PostRecord,
  RuntimeMode,
  ScoredEvent,
  ServiceSetupStatus,
  SetupStatusTone,
  StoreProfile,
  StoreRadarPoint,
  StoreSituation,
  VisitForecast,
  WatchedWordHit,
  WordBookmark,
} from '@/lib/types'
import './night-radar-console.css'

type ApiState = { tone: 'idle' | 'good' | 'warn'; message: string }
type ViewKey = 'radar' | 'analytics' | 'capture' | 'automate' | 'account'
type AnalyticsPanelKey = 'words' | 'forecast' | 'search' | 'weekday'
type ExactMatchFilter = ExactTermGroup | 'all'

type Props = {
  calendarEvents?: EventInput[]
  initialState: DashboardState
}

const navItems: Array<{ key: ViewKey; label: string; icon: ReactNode }> = [
  { key: 'analytics', label: '今日', icon: <Broadcast size={20} weight="bold" /> },
  { key: 'radar', label: '候補', icon: <ChartLineUp size={20} weight="bold" /> },
  { key: 'capture', label: '店舗', icon: <Storefront size={20} weight="bold" /> },
  { key: 'automate', label: '分析', icon: <MagicWand size={20} weight="bold" /> },
  { key: 'account', label: '設定', icon: <ShieldCheck size={20} weight="bold" /> },
]

const analyticsPanels: Array<{ key: AnalyticsPanelKey; label: string }> = [
  { key: 'words', label: '注目' },
  { key: 'forecast', label: '候補' },
  { key: 'search', label: '検索' },
  { key: 'weekday', label: '曜日' },
]

const exactTermLabels = {
  popularSingleMale: '人気単独男性',
  popularSingleFemale: '人気単独女性',
  negativePerson: '不人気・苦手',
} as const

const officialEventStoreNames: Record<string, string> = {
  agreeable: 'AgreeAble',
  arabesque: 'ARABESQUE',
  'b-dash': 'B-DASH',
  'bar-canelo': 'BAR CANELO',
  'bar-face': 'BAR FACE',
  'bar-rusk': 'BAR RUSK',
  'bar-spear': 'BAR SPEAR',
  bar440: 'BAR440',
  'campo-bar': 'CAMPO BAR',
  'club-zeus': 'CLUB ZEUS',
  collabo: 'collabo',
  'colors-bar': 'COLORS BAR',
  'communicationbar-sango': 'Communicationbar 珊瑚',
  'filt-shibuya': 'FILT SHIBUYA',
  'harnes-tokyo': 'HARNES TOKYO',
  'honey-trap': 'HONEY TRAP',
  'land-land': 'land land',
  'ogikubo-himitsu-club': '荻窪秘密倶楽部',
  ouvea: 'Ouvea',
  papillon: 'Papillon',
  'retreat-bar': 'RETREAT BAR',
  'secret-bar-silent-moon': 'Secret Bar Silent Moon',
  voluptuous: 'Voluptuous',
}

function resolveStoreDisplayName(stores: StoreProfile[], storeId?: string) {
  const store = stores.find((item) => item.id === storeId)
  return formatBarName(store?.name ?? (storeId ? officialEventStoreNames[storeId] : undefined) ?? storeId)
}

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
  webhook: '外部通知',
}

const setupToneLabels: Record<SetupStatusTone, string> = {
  ready: '接続済み',
  action: '要設定',
  check: '要確認',
  off: '停止中',
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

export function NightRadarConsole({ calendarEvents: initialCalendarEvents, initialState }: Props) {
  const initialStores = initialState.stores
  const initialEvents = initialState.events
  const calendarEvents = initialCalendarEvents?.length ? initialCalendarEvents : initialEvents
  const initialPosts = initialState.posts
  const initialScoredEvents = initialState.scoredEvents
  const initialSituations = initialState.situations
  const wordCategories = initialState.wordCategories
  const subscription = initialState.subscription
  const setupStatus = initialState.setupStatus
  const [view, setView] = useState<ViewKey>('analytics')
  const [mode, setMode] = useState<RuntimeMode>(initialState.mode)
  const [stores] = useState(initialStores)
  const [events] = useState(initialEvents)
  const [posts] = useState(initialPosts)
  const [scoredEvents, setScoredEvents] = useState(initialScoredEvents)
  const [situations] = useState(initialSituations)
  const [bbsSources] = useState<BbsSource[]>(initialState.bbsSources)
  const [exactTerms, setExactTerms] = useState<ExactTermState>(initialState.exactTerms)
  const [serverMatches, setServerMatches] = useState<ExactTermMatch[] | null>(null)
  const [exactMatchFilter, setExactMatchFilter] = useState<ExactMatchFilter>('all')
  const [analysisText, setAnalysisText] = useState(initialPosts[0]?.body ?? '')
  const [analysis, setAnalysis] = useState<AiAnalysis | null>(null)
  const [email, setEmail] = useState(initialState.userEmail ?? '')
  const [apiState, setApiState] = useState<ApiState>({
    tone: initialState.connectionNote ? 'warn' : 'idle',
    message: initialState.connectionNote ?? (initialState.mode === 'database' ? '同期済み' : '待機中'),
  })
  const [jobs, setJobs] = useState<NotificationJob[]>(initialState.notificationJobs)
  const [notificationPreference, setNotificationPreference] = useState<NotificationPreference>(initialState.notificationPreference)
  const [importBatches] = useState<ImportBatch[]>(initialState.importBatches)
  const [crawlRuns] = useState<CrawlRun[]>(initialState.crawlRuns)
  const [bbsSnapshots] = useState<BbsSnapshot[]>(initialState.bbsSnapshots)
  const [wordBookmarks, setWordBookmarks] = useState<WordBookmark[]>(initialState.wordBookmarks)
  const [bookmarkDraft, setBookmarkDraft] = useState('')
  const [watchSearchTerm, setWatchSearchTerm] = useState('')
  const [homePanel, setHomePanel] = useState<AnalyticsPanelKey>('words')
  const [busy, setBusy] = useState('')

  const summary = useMemo(() => summarizeSignals(scoredEvents), [scoredEvents])
  const storeAnalytics = useMemo(() => buildStoreBbsAnalytics(stores, posts), [stores, posts])
  const storeRadar = useMemo(() => buildStoreRadarPoints(stores, posts, bbsSnapshots), [stores, posts, bbsSnapshots])
  const searchableBbsRecords = useMemo(() => buildSearchableBbsRecords(posts, bbsSnapshots), [bbsSnapshots, posts])
  const watchedWordHits = useMemo(
    () => buildWatchedWordHits(searchableBbsRecords, stores, wordBookmarks),
    [searchableBbsRecords, stores, wordBookmarks],
  )
  const searchedWatchedWordHits = useMemo(
    () => buildCustomWatchedWordHits(searchableBbsRecords, stores, watchSearchTerm),
    [searchableBbsRecords, stores, watchSearchTerm],
  )
  const visitForecasts = useMemo(() => buildVisitForecasts(events, stores, posts), [events, stores, posts])
  const exactMatches = useMemo(
    () =>
      searchExactBbsTerms(searchableBbsRecords, stores, [
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
    [exactTerms, searchableBbsRecords, stores],
  )
  const activeExactMatches = serverMatches ?? exactMatches
  const exactMatchCounts = useMemo(
    () => ({
      all: activeExactMatches.length,
      popularSingleMale: activeExactMatches.filter((match) => match.group === 'popularSingleMale').length,
      popularSingleFemale: activeExactMatches.filter((match) => match.group === 'popularSingleFemale').length,
      negativePerson: activeExactMatches.filter((match) => match.group === 'negativePerson').length,
    }),
    [activeExactMatches],
  )
  const filteredExactMatches = useMemo(
    () => (exactMatchFilter === 'all' ? activeExactMatches : activeExactMatches.filter((match) => match.group === exactMatchFilter)),
    [activeExactMatches, exactMatchFilter],
  )
  const featuredEvent = summary.dayTop ?? summary.nightTop ?? scoredEvents[0]
  const focusedStores = storeAnalytics.slice(0, 3)
  const visibleSituations = situations.slice(0, 3)
  const visibleMatches = filteredExactMatches.slice(0, 16)
  const currentPlan = subscription.plan
  const currentLimits = planLimits[currentPlan]
  const visibleImports = importBatches.slice(0, 4)
  const visibleCrawlRuns = crawlRuns.slice(0, 4)
  const activeWatchedHits = watchSearchTerm.trim() ? searchedWatchedWordHits : watchedWordHits
  const visibleWatchedHits = activeWatchedHits.slice(0, 8)
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
  const modeLabel = mode === 'database' ? '保存済み' : mode === 'anonymous' ? 'ログイン待ち' : 'デモ'
  const busyLabel = busy ? '処理中…' : apiState.message === modeLabel ? '待機中' : apiState.message
  const sourceLimitLabel = `${bbsSources.length}件`
  const isSignedIn = Boolean(initialState.userEmail)

  function openTopCalendar() {
    setView('analytics')
    window.setTimeout(() => {
      document.getElementById('top-calendar')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 0)
  }

  function updateExactTerm(group: ExactTermGroup, value: string) {
    setServerMatches(null)
    setExactTerms((current) => ({ ...current, [group]: value }))
  }

  function runWatchedWordSearch() {
    const term = bookmarkDraft.trim()
    if (!term) return flash('検索するワードを入力してください。', 'warn')
    setWatchSearchTerm(term)
    flash(`「${term}」で注目ワードを検索しました。`)
  }

  function clearWatchedWordSearch() {
    setWatchSearchTerm('')
    setBookmarkDraft('')
  }

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
    if (!analysisText.trim()) return flash('分析するテキストが必要です。', 'warn')
    setBusy('ai')
    try {
      const result = await postJson<{ analysis: AiAnalysis; mode: string }>('/api/ai/analyze', { text: analysisText, persist: true })
      setAnalysis(result.analysis)
      flash(`分析を完了しました（${result.mode === 'heuristic' ? '簡易分析' : 'AI分析'}）。`)
    } catch (error) {
      flash(error instanceof Error ? error.message : '分析に失敗しました。', 'warn')
    } finally {
      setBusy('')
    }
  }

  async function addWordBookmark() {
    const pattern = bookmarkDraft.trim()
    if (!pattern) return flash('保存するワードが必要です。', 'warn')

    if (!isSignedIn) {
      const normalizedPattern = normalizeLocalSearchText(pattern)
      const localBookmark: WordBookmark = {
        id: `local-${normalizedPattern.slice(0, 80)}`,
        label: pattern,
        pattern,
        matchType: 'exact',
        createdAt: 'local',
      }
      setWordBookmarks((current) => [
        localBookmark,
        ...current.filter((bookmark) => normalizeLocalSearchText(bookmark.pattern) !== normalizedPattern),
      ])
      setBookmarkDraft(pattern)
      setWatchSearchTerm(pattern)
      flash('この画面に一時保存しました。ログインするとDBに保存できます。', 'warn')
      return
    }

    setBusy('word-bookmark')
    try {
      const result = await postJson<{ bookmark: WordBookmark; mode?: RuntimeMode; message?: string }>('/api/word-bookmarks', {
        label: pattern,
        pattern,
        matchType: 'exact',
      })
      setWordBookmarks((current) => [result.bookmark, ...current.filter((bookmark) => bookmark.id !== result.bookmark.id)])
      setBookmarkDraft(pattern)
      setWatchSearchTerm(pattern)
      applyMode(result.mode, result.message)
      if (!result.message) flash('ワードをブックマークしました。')
    } catch (error) {
      flash(error instanceof Error ? error.message : 'ワードを保存できません。', 'warn')
    } finally {
      setBusy('')
    }
  }

  async function deleteWordBookmark(id: string) {
    if (id.startsWith('local-')) {
      setWordBookmarks((current) => current.filter((bookmark) => bookmark.id !== id))
      flash('一時保存ワードを削除しました。')
      return
    }

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
      return flash('外部通知を使う場合は、送信先のアドレスが必要です。', 'warn')
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
        flash(result.message ?? '決済はデモモードです。', 'warn')
      } else if (result.url) {
        window.location.assign(result.url)
      }
    } catch (error) {
      flash(error instanceof Error ? error.message : '決済画面を開始できません。', 'warn')
    } finally {
      setBusy('')
    }
  }

  async function openBillingPortal() {
    setBusy('portal')
    try {
      const result = await postJson<{ url: string; mode?: string; message?: string }>('/api/stripe/portal', {})
      if (result.mode === 'demo') {
        flash(result.message ?? '決済はデモモードです。', 'warn')
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
        <RadarBackdrop />
        <header className="app-topbar">
          <button className="brand-chip" type="button" onClick={() => setView('analytics')} aria-label="今日の画面へ戻る">
            <Crosshair size={18} weight="bold" />
            <span>ナイトレーダー</span>
          </button>
          <div className="status-cluster">
            <StatusPill icon={<ShieldCheck size={16} weight="bold" />} label={modeLabel} tone={mode === 'database' ? 'good' : 'warn'} />
            <StatusPill icon={<Lightning size={16} weight="bold" />} label={busyLabel} tone={busy ? 'warn' : apiState.tone} />
          </div>
        </header>

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

        {view === 'radar' && (
          <section className="view-stack">
            <section className="radar-hero-card">
              <div className="radar-copy">
                <span>行き先候補</span>
                <h1>今日見るべき候補</h1>
                <p>
                  店舗イベント、掲示板の投稿鮮度、曜日相性、注目ワードから、検討しやすい順に並べます。来店を保証するものではありません。
                </p>
                <dl className="radar-meaning-list">
                  <div>
                    <dt>対象</dt>
                    <dd>店舗イベント・掲示板</dd>
                  </div>
                  <div>
                    <dt>根拠</dt>
                    <dd>{featuredEvent?.reasons[0] ?? '投稿と曜日傾向'}</dd>
                  </div>
                  <div>
                    <dt>見る所</dt>
                    <dd>上位候補と理由</dd>
                  </div>
                </dl>
              </div>
              <div className="radar-orbit" aria-label={`公開シグナル期待度 ${radarScore}`}>
                <i />
                <i />
                <i />
                <strong>{radarScore || '--'}</strong>
                <span>点</span>
              </div>
            </section>

            <section className="signal-carousel" aria-label="本日のシグナル">
              <SignalTile label="昼の候補" event={summary.dayTop} />
              <SignalTile label="夜の候補" event={summary.nightTop} />
            </section>

            <section className="quick-actions" aria-label="主要操作">
              <ActionButton icon={<ChartLineUp size={20} weight="bold" />} label="再計算" onClick={runScoring} disabled={busy === 'score'} />
              <ActionButton icon={<ChartBarHorizontal size={20} weight="bold" />} label="今日" onClick={() => setView('analytics')} />
              <ActionButton icon={<Storefront size={20} weight="bold" />} label="店舗" onClick={() => setView('capture')} />
              <ActionButton
                icon={<MagnifyingGlass size={20} weight="bold" />}
                label="検索"
                onClick={() => {
                  setHomePanel('search')
                  setView('analytics')
                }}
              />
            </section>

            <section className="insight-card">
              <div className="section-heading">
                <span>注目語</span>
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
                <span>候補順</span>
                <h2>検討候補リスト</h2>
                <p>点数は「曜日相性・イベント種別・掲示板投稿の具体性」を合わせた優先度です。</p>
              </div>
              <div className="score-list">
                {scoredEvents.slice(0, 5).map((event) => (
                  <ScoreRow event={event} key={event.id} />
                ))}
              </div>
            </section>

            <LatestPost source={formatPostSource(latestPost?.source ?? 'manual')} body={latestPost?.body ?? 'まだ投稿がありません。'} />
          </section>
        )}

        {view === 'analytics' && (
          <section className="view-stack">
            <TodayDecisionCard
              featuredEvent={featuredEvent}
              hotStore={hotStore}
              latestCaptureLabel={latestCaptureLabel}
              onOpenPanel={setHomePanel}
              onRunScoring={runScoring}
              topForecast={topForecasts[0]}
              watchStore={watchStore}
              busy={busy}
            />

            <HotCompactBar points={storeRadar} />

            <MonthlyCalendarPreview events={calendarEvents} stores={stores} />

            <PanelSwitcher active={homePanel} onChange={setHomePanel} />

            {homePanel === 'words' && (
              <WatchedWordsPanel
                hits={visibleWatchedHits}
                bookmarks={wordBookmarks}
                bookmarkDraft={bookmarkDraft}
                searchTerm={watchSearchTerm}
                busy={busy}
                onDraftChange={setBookmarkDraft}
                onAddBookmark={addWordBookmark}
                onDeleteBookmark={deleteWordBookmark}
                onSearch={runWatchedWordSearch}
                onClearSearch={clearWatchedWordSearch}
                onUseBookmark={(bookmark) => {
                  setBookmarkDraft(bookmark.pattern)
                  setWatchSearchTerm(bookmark.pattern)
                }}
              />
            )}

            {homePanel === 'forecast' && <ForecastPreview forecasts={topForecasts} />}

            {homePanel === 'search' && (
              <section className="app-card form-card compact-search-card">
                <FormTitle icon={<MagnifyingGlass size={19} weight="bold" />} title="全店掲示板の完全一致" />
                <p className="form-note">カンマ・読点・改行で複数指定できます。全角半角と空白は吸収して照合します。</p>
                <div className="term-grid">
                  <label>
                    <span>人気単独男性</span>
                    <input
                      autoComplete="off"
                      name="popularSingleMale"
                      placeholder="例: 人気単男A"
                      spellCheck={false}
                      value={exactTerms.popularSingleMale}
                      onChange={(event) => updateExactTerm('popularSingleMale', event.target.value)}
                    />
                  </label>
                  <label>
                    <span>人気単独女性</span>
                    <input
                      autoComplete="off"
                      name="popularSingleFemale"
                      placeholder="例: 人気単女B"
                      spellCheck={false}
                      value={exactTerms.popularSingleFemale}
                      onChange={(event) => updateExactTerm('popularSingleFemale', event.target.value)}
                    />
                  </label>
                  <label>
                    <span>不人気・苦手</span>
                    <input
                      autoComplete="off"
                      name="negativePerson"
                      placeholder="例: 苦手さんC"
                      spellCheck={false}
                      value={exactTerms.negativePerson}
                      onChange={(event) => updateExactTerm('negativePerson', event.target.value)}
                    />
                  </label>
                </div>
                <button type="button" onClick={saveExactTerms} disabled={!isSignedIn || busy === 'exact'}>
                  <MagnifyingGlass size={17} weight="bold" />
                  {isSignedIn ? '条件を保存' : 'ログイン後に保存'}
                </button>
                <ExactMatchList
                  activeFilter={exactMatchFilter}
                  counts={exactMatchCounts}
                  matches={visibleMatches}
                  total={activeExactMatches.length}
                  onFilterChange={setExactMatchFilter}
                />
              </section>
            )}

            {homePanel === 'weekday' && (
              <section className="app-card">
                <div className="section-heading">
                  <span>曜日</span>
                  <h2>曜日別の反応</h2>
                </div>
                <div className="weekday-matrix">
                  {focusedStores.map((item) => (
                    <article className="weekday-row" key={item.store.id}>
                      <div>
                        <strong>{formatBarName(item.store.name)}</strong>
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
            )}

            <section className="app-card form-card">
              <FormTitle icon={<MapPin size={19} weight="bold" />} title="店舗状況" />
              <div className="situation-list">
                {visibleSituations.length ? (
                  visibleSituations.map((situation) => (
                    <SituationCard
                      key={situation.id}
                      situation={situation}
                      storeName={resolveStoreDisplayName(stores, situation.storeId)}
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
            <ViewIntro eyebrow="店舗管理" title="店舗・巡回先" body="店舗、イベント、掲示板の巡回先は運営側で更新します。" />

            <OpsPanel
              mode={mode}
              sourceLimitLabel={sourceLimitLabel}
              crawlRuns={visibleCrawlRuns}
              importBatches={visibleImports}
              jobs={jobs}
            />

            <section className="app-card catalog-card">
              <div className="section-heading">
                <span>登録店舗</span>
                <h2>登録店舗</h2>
              </div>
              <div className="catalog-list">
                {stores.length ? (
                  stores.slice(0, 12).map((store) => (
                    <article key={store.id}>
                      <div>
                        <strong>{formatBarName(store.name)}</strong>
                        <span>
                          {formatStoreArea(store.area)} / {formatStoreSessionLabel(store)}
                        </span>
                      </div>
                      <em>登録済み</em>
                    </article>
                  ))
                ) : (
                  <p className="muted-note">運営側で店舗マスタを投入すると表示されます。</p>
                )}
              </div>
            </section>

            <section className="app-card catalog-card">
              <div className="section-heading">
                <span>掲示板巡回</span>
                <h2>巡回対象</h2>
              </div>
              <div className="source-list">
                {bbsSources.length ? (
                  bbsSources.slice(0, 10).map((source) => (
                    <article key={source.id}>
                      <div>
                        <strong>{source.label === 'BBS' ? '掲示板' : source.label}</strong>
                        <span>
                          {resolveStoreDisplayName(stores, source.storeId)} / {formatCrawlStatus(source.lastStatus)}
                        </span>
                      </div>
                      <em>{source.crawlIntervalMinutes}分</em>
                    </article>
                  ))
                ) : (
                  <p className="muted-note">掲示板のアドレスは管理側の登録データで追加します。</p>
                )}
              </div>
              <CrawlRunList runs={visibleCrawlRuns} />
            </section>

            <section className="app-card catalog-card">
              <div className="section-heading">
                <span>月間予定</span>
                <h2>月間イベント</h2>
              </div>
              <div className="score-list">
                {calendarEvents.slice(0, 8).map((event) => (
                  <article className="score-row" key={event.id}>
                    <div>
                      <strong>{event.title}</strong>
                      <small>
                        {resolveStoreDisplayName(stores, event.storeId)} / {event.date} {event.startsAt}
                      </small>
                    </div>
                    <em>{event.session === 'day' ? '昼' : '夜'}</em>
                  </article>
                ))}
              </div>
              <button className="text-action" type="button" onClick={openTopCalendar}>
                TOPで確認
              </button>
            </section>
          </section>
        )}

        {view === 'automate' && (
          <section className="view-stack">
            <ViewIntro eyebrow="分析と通知" title="分析・通知" body="店舗と掲示板データは運営側で巡回し、ユーザーは分析と通知設定を扱います。" />

            <section className="app-card form-card">
              <FormTitle icon={<MagicWand size={19} weight="bold" />} title="自動分析" />
              <p className="form-note">入力欄の文章だけを分類します。初期表示は直近の掲示板投稿です。</p>
              <textarea aria-label="分析対象テキスト" name="analysisText" value={analysisText} onChange={(event) => setAnalysisText(event.target.value)} rows={5} />
              <button type="button" onClick={runAiAnalysis} disabled={busy === 'ai'}>
                <Sparkle size={17} weight="fill" />
                分類する
              </button>
              {analysis && (
                <div className="analysis-result">
                  <strong>
                    {analysis.eventCategory}・{analysis.session === 'day' ? '昼向き' : '夜向き'}
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
                    <option value="webhook">外部通知</option>
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
                  aria-label="外部通知の送信先"
                  autoComplete="off"
                  name="notificationWebhookUrl"
                  placeholder="外部通知の送信先…"
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
                        {notificationChannelLabels[job.channel]} / {formatJobStatus(job.status)}
                      </span>
                    </article>
                  ))
                ) : (
                  <p className="muted-note">メール配信または外部通知の送信先が未設定の場合は、試行記録として通知だけ作成します。</p>
                )}
              </div>
            </section>
          </section>
        )}

        {view === 'account' && (
          <section className="view-stack">
            <ViewIntro eyebrow="設定" title="アカウント" body="ログイン、支払い、公開情報ポリシーを管理します。" />

            <SetupStatusPanel status={setupStatus} />

            <section className="app-card form-card">
              <FormTitle icon={<ShieldCheck size={19} weight="bold" />} title="認証" />
              <div className="account-state">
                <span>{initialState.userEmail ? initialState.userEmail : '未ログイン'}</span>
                <strong>{planLabels[subscription.plan]} / {subscription.status}</strong>
              </div>
              <button type="button" onClick={() => startOAuth('x')} disabled={busy === 'x'}>
                <XLogo size={19} weight="bold" />
                Xでログイン
              </button>
              <button className="secondary-action" type="button" onClick={() => startOAuth('google')} disabled={busy === 'google'}>
                <GoogleLogo size={19} weight="bold" />
                Googleでログイン
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
                <span>認証</span>
                <span>プラン</span>
                <span>決済</span>
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
                      掲示板 {planLimits[plan.key].bbsSources}件 / 完全一致 各{planLimits[plan.key].exactTermsPerGroup}語
                    </small>
                    <small>{isSignedIn ? '決済画面へ進む' : 'ログイン後に開始'}</small>
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

      </section>
    </main>
  )
}

const backdropNodes = [
  { x: '12%', y: '16%', size: 3, delay: 0 },
  { x: '78%', y: '14%', size: 4, delay: 0.4 },
  { x: '88%', y: '38%', size: 2, delay: 0.8 },
  { x: '18%', y: '58%', size: 4, delay: 1.2 },
  { x: '66%', y: '72%', size: 3, delay: 1.6 },
  { x: '35%', y: '86%', size: 2, delay: 2 },
]

function RadarBackdrop() {
  const reduceMotion = useReducedMotion()

  return (
    <div className="radar-backdrop" aria-hidden="true">
      <motion.div
        className="backdrop-aurora"
        animate={
          reduceMotion
            ? undefined
            : {
                opacity: [0.48, 0.78, 0.58, 0.48],
                x: [0, 18, -10, 0],
                y: [0, -12, 8, 0],
              }
        }
        transition={{ duration: 18, ease: 'easeInOut', repeat: Infinity }}
      />
      <motion.div
        className="backdrop-sweep"
        animate={reduceMotion ? undefined : { x: ['-42%', '118%'], opacity: [0, 0.9, 0] }}
        transition={{ duration: 5.8, ease: 'easeInOut', repeat: Infinity, repeatDelay: 1.6 }}
      />
      <svg className="backdrop-circuit" viewBox="0 0 640 920" preserveAspectRatio="none">
        <motion.path
          d="M40 142 C160 104 220 188 318 151 C438 105 498 146 606 90"
          pathLength={1}
          initial={false}
          animate={reduceMotion ? undefined : { pathLength: [0.18, 1, 0.42], opacity: [0.18, 0.58, 0.22] }}
          transition={{ duration: 9, ease: 'easeInOut', repeat: Infinity }}
        />
        <motion.path
          d="M24 672 C146 590 222 710 330 620 C438 528 514 614 626 548"
          pathLength={1}
          initial={false}
          animate={reduceMotion ? undefined : { pathLength: [0.24, 0.78, 1], opacity: [0.12, 0.46, 0.2] }}
          transition={{ duration: 11, ease: 'easeInOut', repeat: Infinity, delay: 1.4 }}
        />
      </svg>
      <div className="backdrop-grid" />
      {backdropNodes.map((node) => (
        <motion.span
          className="backdrop-node"
          key={`${node.x}-${node.y}`}
          style={{ '--node-x': node.x, '--node-y': node.y, '--node-size': `${node.size}px` } as CSSProperties}
          animate={reduceMotion ? undefined : { scale: [1, 1.8, 1], opacity: [0.34, 0.82, 0.34] }}
          transition={{ duration: 3.6, ease: 'easeInOut', repeat: Infinity, delay: node.delay }}
        />
      ))}
    </div>
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

function TodayDecisionCard({
  hotStore,
  watchStore,
  featuredEvent,
  topForecast,
  latestCaptureLabel,
  busy,
  onRunScoring,
  onOpenPanel,
}: {
  hotStore?: StoreRadarPoint
  watchStore?: StoreRadarPoint
  featuredEvent?: ScoredEvent
  topForecast?: VisitForecast
  latestCaptureLabel: string
  busy: string
  onRunScoring: () => void
  onOpenPanel: (panel: AnalyticsPanelKey) => void
}) {
  const score = hotStore?.score ?? featuredEvent?.score ?? 0
  const scoreProgress = `${Math.max(0, Math.min(100, score))}%`
  const primaryReason =
    topForecast?.reasons[0] ??
    featuredEvent?.reasons[0] ??
    (hotStore ? `${hotStore.verdict}、注目シグナル ${hotStore.signals.totalSignals}件` : '掲示板の巡回後に判定が出ます。')
  const secondaryReason = hotStore
    ? `女性${hotStore.signals.femaleOnly} / 初${hotStore.signals.firstVisit} / 複${hotStore.signals.groupVisit}`
    : `巡回 ${latestCaptureLabel}`

  return (
    <section className="today-decision-card" aria-label="今日の結論">
      <div className="decision-kicker">
        <span>今日の判定</span>
        <em>{latestCaptureLabel}</em>
      </div>
      <div className="decision-main">
        <div>
          <strong>{hotStore ? `${formatBarName(hotStore.store.name)} が最優先` : '観測待ち'}</strong>
          <p>{primaryReason}</p>
        </div>
        <div className="decision-score" aria-label={`現在スコア ${score}`} style={{ '--score-progress': scoreProgress } as CSSProperties}>
          <div className="decision-score-inner">
            <span>{score || '--'}</span>
            <small>点</small>
          </div>
        </div>
      </div>
      <dl className="decision-facts">
        <div>
          <dt>根拠</dt>
          <dd>{secondaryReason}</dd>
        </div>
        <div>
          <dt>余地</dt>
          <dd>{watchStore ? `${formatBarName(watchStore.store.name)} / ${watchStore.verdict}` : '比較対象なし'}</dd>
        </div>
      </dl>
      <div className="decision-actions">
        <button type="button" onClick={onRunScoring} disabled={busy === 'score'}>
          <ChartLineUp size={17} weight="bold" />
          再計算
        </button>
        <button type="button" onClick={() => onOpenPanel('forecast')}>
          候補詳細
        </button>
        <a href="#top-calendar">
          月間イベント
        </a>
      </div>
    </section>
  )
}

function HotCompactBar({ points }: { points: StoreRadarPoint[] }) {
  const topThree = points.slice(0, 3)
  const top = topThree[0]

  return (
    <section className="hot-compact-card" aria-label="盛り上がり比率と上位店舗">
      <div className="hot-compact-head">
        <span>盛り上がり比率</span>
        <strong>{top ? `${formatBarName(top.store.name)} ${top.share}%` : '未観測'}</strong>
      </div>
      <div className="hot-share-track" aria-hidden="true">
        {topThree.map((point, index) => (
          <i
            className={`${point.tone} ${index === 0 ? 'is-leading' : ''}`}
            key={point.store.id}
            style={{ inlineSize: `${Math.max(8, point.share)}%` }}
          />
        ))}
      </div>
      <div className="top-store-strip">
        {topThree.length ? (
          topThree.map((point) => (
            <article key={point.store.id}>
              <span>{point.rank}</span>
              <div>
                <strong>{formatBarName(point.store.name)}</strong>
                <small>{point.verdict}</small>
              </div>
              <em>{point.score}</em>
            </article>
          ))
        ) : (
          <p className="muted-note">掲示板を取り込むと上位店舗が出ます。</p>
        )}
      </div>
    </section>
  )
}

function PanelSwitcher({
  active,
  onChange,
}: {
  active: AnalyticsPanelKey
  onChange: (panel: AnalyticsPanelKey) => void
}) {
  return (
    <nav className="home-panel-tabs" aria-label="掲示板分析パネル">
      {analyticsPanels.map((panel) => (
        <button
          className={active === panel.key ? 'is-active' : ''}
          key={panel.key}
          type="button"
          onClick={() => onChange(panel.key)}
        >
          {panel.label}
        </button>
      ))}
    </nav>
  )
}

function SignalTile({ label, event }: { label: string; event?: ScoredEvent }) {
  return (
    <article className={`signal-tile ${event?.tone ?? 'quiet'}`}>
      <span className="tile-icon">
        <Lightning size={21} weight="duotone" />
      </span>
      <div>
        <p>{label}</p>
        <strong>{event ? `${formatBarName(event.store.name)} / ${event.title}` : '未計算'}</strong>
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
          {formatBarName(event.store.name)} / {event.title}
        </strong>
        <small>
          {event.date} {event.startsAt} / {event.reasons.join('、')}
        </small>
      </div>
      <em>{event.score}</em>
    </article>
  )
}

function MonthlyCalendarPreview({ events, stores }: { events: EventInput[]; stores: StoreProfile[] }) {
  const cells = useMemo(() => buildCalendarPreviewCells(events, stores), [events, stores])
  const eventCount = cells.reduce((sum, cell) => sum + cell.items.length, 0)
  const [selectedDay, setSelectedDay] = useState<CalendarPreviewCell | null>(null)

  const openDrawerOnSmallScreen = (cell: CalendarPreviewCell) => {
    if (cell.isBlank || !cell.items.length) return
    if (window.matchMedia('(max-width: 760px)').matches) setSelectedDay(cell)
  }

  return (
    <section className="calendar-preview-card" id="top-calendar" aria-label="月間イベント">
      <div className="calendar-preview-head">
        <CalendarDots size={20} weight="bold" />
        <div>
          <span>月間イベント</span>
          <strong>2026.06</strong>
        </div>
        <em>TOP内で確認</em>
      </div>
      <div className="mini-month-grid" role="grid" aria-label="2026年6月の店舗イベント">
        {['月', '火', '水', '木', '金', '土', '日'].map((day) => (
          <span className="mini-weekday" key={day}>
            {day}
          </span>
        ))}
        {cells.map((cell) => (
          <article
            className={`mini-day ${cell.isBlank ? 'is-blank' : ''} ${cell.isToday ? 'is-today' : ''}`}
            key={cell.key}
          >
            {!cell.isBlank && (
              <button
                aria-label={`${cell.dateLabel}のイベント${cell.items.length}件を表示`}
                className="mini-day-button"
                disabled={!cell.items.length}
                type="button"
                onClick={() => openDrawerOnSmallScreen(cell)}
              >
                <strong>{cell.day}</strong>
                <div aria-hidden={!cell.items.length}>
                  {cell.items.slice(0, 2).map((item) => (
                    <span className={`event-color-${item.tone}`} key={`${cell.key}-${item.id}`}>
                      {item.label}
                    </span>
                  ))}
                  {cell.items.length > 2 && <em>+{cell.items.length - 2}</em>}
                </div>
              </button>
            )}
            {cell.items.length ? <TopCalendarDayPanel cell={cell} variant="popover" /> : null}
          </article>
        ))}
      </div>
      <p>{eventCount ? `${eventCount}件の公式イベントを日付別に確認できます。` : 'イベント登録後に月間予定が出ます。'}</p>
      {selectedDay ? (
        <div className="top-calendar-drawer-backdrop" role="presentation" onClick={() => setSelectedDay(null)}>
          <aside
            aria-label={`${selectedDay.dateLabel}のイベント詳細`}
            aria-modal="true"
            className="top-calendar-drawer"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <button className="top-calendar-drawer-close" type="button" onClick={() => setSelectedDay(null)}>
              閉じる
            </button>
            <TopCalendarDayPanel cell={selectedDay} variant="drawer" />
          </aside>
        </div>
      ) : null}
    </section>
  )
}

function TopCalendarDayPanel({ cell, variant }: { cell: CalendarPreviewCell; variant: 'popover' | 'drawer' }) {
  const visibleItems = variant === 'popover' ? cell.items.slice(0, 5) : cell.items
  const hiddenCount = cell.items.length - visibleItems.length

  return (
    <section
      aria-hidden={variant === 'popover' ? true : undefined}
      aria-label={`${cell.dateLabel}のイベント詳細`}
      className={`top-calendar-day-panel is-${variant}`}
    >
      <header>
        <div>
          <span>日別詳細</span>
          <strong>{cell.dateLabel}</strong>
        </div>
        <em>{cell.items.length}件</em>
      </header>
      <div className="top-calendar-events">
        {visibleItems.map((item) => (
          <article key={item.id}>
            <div>
              <strong>{item.storeName}</strong>
              <span>
                {item.startsAt || '時間未定'} / {item.session === 'day' ? '昼' : '夜'} / {item.category}
              </span>
            </div>
            <p>{item.title}</p>
            {item.details ? <small>{item.details}</small> : null}
            {item.sourceUrl ? (
              <a href={item.sourceUrl} target="_blank" rel="noreferrer" tabIndex={variant === 'popover' ? -1 : undefined}>
                公式ページ
              </a>
            ) : null}
          </article>
        ))}
        {hiddenCount > 0 ? <span className="top-calendar-more">ほか {hiddenCount}件</span> : null}
      </div>
    </section>
  )
}

type CalendarPreviewCell = {
  key: string
  dateLabel: string
  day: number
  isBlank: boolean
  isToday: boolean
  items: CalendarPreviewItem[]
}

type CalendarPreviewItem = {
  id: string
  label: string
  tone: 0 | 1 | 2
  storeName: string
  startsAt: string
  session: EventInput['session']
  category: string
  title: string
  details?: string
  sourceUrl?: string
}

function buildCalendarPreviewCells(events: EventInput[], stores: StoreProfile[]): CalendarPreviewCell[] {
  const year = 2026
  const monthIndex = 5
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const firstDay = new Date(year, monthIndex, 1).getDay()
  const leadingBlanks = (firstDay + 6) % 7
  const today = new Date()
  const todayDay = today.getFullYear() === year && today.getMonth() === monthIndex ? today.getDate() : 0
  const eventDays = new Map<number, CalendarPreviewItem[]>()

  for (const event of events) {
    const day = resolveEventDay(event, year, monthIndex)
    if (!day) continue
    const storeName = resolveStoreDisplayName(stores, event.storeId)
    eventDays.set(day, [
      ...(eventDays.get(day) ?? []),
      {
        id: event.id,
        label: storeName,
        tone: event.session === 'day' ? 1 : 0,
        storeName,
        startsAt: event.startsAt,
        session: event.session,
        category: event.category,
        title: event.title,
        details: event.details,
        sourceUrl: event.sourceUrl,
      },
    ])
  }

  const cells: CalendarPreviewCell[] = Array.from({ length: leadingBlanks }, (_, index) => ({
    key: `blank-${index}`,
    dateLabel: '',
    day: 0,
    isBlank: true,
    isToday: false,
    items: [],
  }))

  for (let day = 1; day <= daysInMonth; day += 1) {
    const unique = dedupeCalendarItems(eventDays.get(day) ?? [])
    cells.push({
      key: `day-${day}`,
      dateLabel: `6/${day}(${['日', '月', '火', '水', '木', '金', '土'][new Date(year, monthIndex, day).getDay()]})`,
      day,
      isBlank: false,
      isToday: day === todayDay,
      items: unique,
    })
  }

  return cells
}

function resolveEventDay(event: EventInput, year: number, monthIndex: number) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(event.date)) {
    const parsed = new Date(`${event.date}T00:00:00`)
    if (parsed.getFullYear() === year && parsed.getMonth() === monthIndex) return parsed.getDate()
    return 0
  }

  const now = new Date()
  const anchor = now.getFullYear() === year && now.getMonth() === monthIndex ? now : new Date(year, monthIndex, 2)
  if (event.date === '今日') return anchor.getDate()
  if (event.date === '明日') {
    const tomorrow = new Date(anchor)
    tomorrow.setDate(anchor.getDate() + 1)
    return tomorrow.getMonth() === monthIndex ? tomorrow.getDate() : 0
  }

  const weekdayIndex = ['日曜', '月曜', '火曜', '水曜', '木曜', '金曜', '土曜'].indexOf(event.weekday)
  if (weekdayIndex < 0) return 0
  const candidate = new Date(anchor)
  const offset = (weekdayIndex - candidate.getDay() + 7) % 7
  candidate.setDate(candidate.getDate() + offset)
  return candidate.getMonth() === monthIndex ? candidate.getDate() : 0
}

function dedupeCalendarItems(items: CalendarPreviewItem[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = `${item.storeName}-${item.title}-${item.startsAt}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function normalizeLocalSearchText(value: string) {
  return value.normalize('NFKC').replace(/\s+/g, '').toLowerCase()
}

function buildLocalSnippet(body: string, term: string) {
  const exactIndex = body.indexOf(term)
  const index = exactIndex >= 0 ? exactIndex : Math.max(0, Math.floor(body.length * 0.35))
  const start = Math.max(0, index - 32)
  const end = Math.min(body.length, index + term.length + 48)
  return `${start > 0 ? '…' : ''}${body.slice(start, end)}${end < body.length ? '…' : ''}`
}

function buildCustomWatchedWordHits(posts: PostRecord[], stores: StoreProfile[], term: string): WatchedWordHit[] {
  const query = term.trim()
  const normalizedQuery = normalizeLocalSearchText(query)
  if (!normalizedQuery) return []

  const storeMap = new Map(stores.map((store) => [store.id, store]))
  const hits: WatchedWordHit[] = []

  posts.forEach((post) => {
    const store = storeMap.get(post.storeId)
    if (!store) return
    if (!post.body.includes(query) && !normalizeLocalSearchText(post.body).includes(normalizedQuery)) return

    hits.push({
      id: `custom-${post.id}-${normalizedQuery}`,
      label: '任意ワード',
      term: query,
      store,
      post,
      snippet: buildLocalSnippet(post.body, query),
      severity: 'medium',
    })
  })

  return hits.toSorted((a, b) => new Date(b.post.postedAt).getTime() - new Date(a.post.postedAt).getTime())
}

function WatchedWordsPanel({
  hits,
  bookmarks,
  bookmarkDraft,
  searchTerm,
  busy,
  onDraftChange,
  onAddBookmark,
  onDeleteBookmark,
  onSearch,
  onClearSearch,
  onUseBookmark,
}: {
  hits: WatchedWordHit[]
  bookmarks: WordBookmark[]
  bookmarkDraft: string
  searchTerm: string
  busy: string
  onDraftChange: (value: string) => void
  onAddBookmark: () => void
  onDeleteBookmark: (id: string) => void
  onSearch: () => void
  onClearSearch: () => void
  onUseBookmark: (bookmark: WordBookmark) => void
}) {
  return (
    <section className="app-card watched-card">
      <div className="section-heading">
        <span>注目語</span>
        <h2>注目ワード</h2>
        <p>任意のワードを検索し、必要なら保存できます。保存済みワードはあとから削除できます。</p>
      </div>
      <div className="watch-word-chips" aria-label="固定監視ワード">
        <span>女性</span>
        <span>初めて</span>
        <span>久しぶり</span>
        <span>2人組</span>
        <span>絵文字</span>
      </div>
      <form
        className="bookmark-form"
        onSubmit={(event) => {
          event.preventDefault()
          onSearch()
        }}
      >
        <input
          aria-label="検索または保存する注目ワード"
          autoComplete="off"
          name="bookmarkWord"
          placeholder="検索・追加ワード…"
          value={bookmarkDraft}
          onChange={(event) => onDraftChange(event.target.value)}
        />
        <button className="secondary-action" type="button" disabled={!bookmarkDraft.trim()} onClick={onSearch}>
          検索
        </button>
        <button type="button" disabled={busy === 'word-bookmark'} onClick={onAddBookmark}>
          保存
        </button>
      </form>
      {searchTerm ? (
        <div className="watch-search-state">
          <span>検索中: {searchTerm}</span>
          <button type="button" onClick={onClearSearch}>
            解除
          </button>
        </div>
      ) : null}
      {bookmarks.length ? (
        <div className="bookmark-list">
          {bookmarks.slice(0, 8).map((bookmark) => (
            <article key={bookmark.id}>
              <button type="button" onClick={() => onUseBookmark(bookmark)}>
                {bookmark.label}
              </button>
              <button aria-label={`${bookmark.label}を削除`} type="button" onClick={() => onDeleteBookmark(bookmark.id)}>
                <Trash size={13} weight="bold" />
              </button>
            </article>
          ))}
        </div>
      ) : null}
      <div className="watch-hit-list">
        {hits.length ? (
          hits.map((hit) => (
            <article className={`watch-hit ${hit.severity}`} key={hit.id}>
              <span>{hit.label}</span>
              <strong>{formatBarName(hit.store.name)}</strong>
              <p>{hit.snippet}</p>
            </article>
          ))
        ) : (
          <p className="muted-note">掲示板投稿を取り込むと、注目ワードがここに出ます。</p>
        )}
      </div>
    </section>
  )
}

function ForecastPreview({ forecasts }: { forecasts: VisitForecast[] }) {
  return (
    <section className="app-card forecast-preview">
      <div className="section-heading">
        <span>行き先候補</span>
        <h2>検討候補 上位3件</h2>
        <p>掲示板とイベント情報から、今日比較しやすい候補だけを絞ります。</p>
      </div>
      <div className="forecast-list-mini">
        {forecasts.length ? (
          forecasts.map((forecast) => (
            <article key={forecast.id}>
              <span>{forecast.rank}</span>
              <div>
                <strong>{formatBarName(forecast.store.name)}</strong>
                <small>
                  {forecast.dateLabel} {forecast.timeLabel} / {forecast.reasons[0]}
                </small>
              </div>
              <em>{forecast.score}</em>
            </article>
          ))
        ) : (
          <p className="muted-note">イベントと掲示板投稿を追加するとランキングが出ます。</p>
        )}
      </div>
      <a className="text-action" href="/forecast">
        候補を詳しく見る
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

function formatPostSource(source: string) {
  const labels: Record<string, string> = {
    manual: '手入力',
    csv: '取込',
    scrape: '巡回',
    ai: '分析',
  }
  return labels[source] ?? source
}

function formatCrawlStatus(status?: string) {
  const labels: Record<string, string> = {
    ok: '取得済み',
    failed: '失敗',
    blocked: 'ブロック',
    pending: '確認待ち',
  }
  return labels[status ?? 'pending'] ?? status ?? '確認待ち'
}

function formatJobStatus(status?: string) {
  const labels: Record<string, string> = {
    sent: '送信済み',
    failed: '失敗',
    dry_run: '試行のみ',
    queued: '待機中',
    pending: '確認待ち',
  }
  return labels[status ?? 'pending'] ?? status ?? '確認待ち'
}

function SetupStatusPanel({ status }: { status: ServiceSetupStatus }) {
  const hasRequiredActions = status.actionCount > 0

  return (
    <section className="app-card setup-status-panel" aria-label="外部サービス接続状態">
      <div className="setup-status-head">
        <div className="section-heading">
          <span>接続状態</span>
          <h2>外部サービスの準備状況</h2>
          <p>キーの値は表示せず、接続に必要な設定が揃っているかだけを確認します。</p>
        </div>
        <strong className={hasRequiredActions ? 'is-action' : 'is-ready'}>
          {hasRequiredActions ? `要設定 ${status.actionCount}件` : '主要設定OK'}
        </strong>
      </div>

      <div className="setup-status-grid">
        {status.items.map((entry) => (
          <article className={`setup-status-item is-${entry.tone}`} key={entry.id}>
            <div>
              <span>{entry.label}</span>
              <strong>{entry.summary}</strong>
            </div>
            <em>{setupToneLabels[entry.tone]}</em>
            <p>{entry.detail}</p>
          </article>
        ))}
      </div>
    </section>
  )
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
        <strong>{mode === 'database' ? '保存済み' : mode === 'anonymous' ? 'ログイン待ち' : 'デモ'}</strong>
      </div>
      <div className="ops-tile">
        <Broadcast size={17} weight="bold" />
        <span>掲示板</span>
        <strong>{sourceLimitLabel}</strong>
      </div>
      <div className="ops-tile">
        <GlobeHemisphereEast size={17} weight="bold" />
        <span>巡回</span>
        <strong>{latestRun ? formatCrawlStatus(latestRun.status) : '未実行'}</strong>
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
    <div className="mini-history" aria-label="掲示板巡回履歴">
      {runs.map((run) => (
        <article key={run.id}>
          <span>{formatCrawlStatus(run.status)}</span>
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

function ExactMatchList({
  activeFilter,
  counts,
  matches,
  total,
  onFilterChange,
}: {
  activeFilter: ExactMatchFilter
  counts: Record<ExactMatchFilter, number>
  matches: ExactTermMatch[]
  total: number
  onFilterChange: (filter: ExactMatchFilter) => void
}) {
  const filters: Array<{ key: ExactMatchFilter; label: string }> = [
    { key: 'all', label: 'すべて' },
    { key: 'popularSingleMale', label: '単独男性' },
    { key: 'popularSingleFemale', label: '単独女性' },
    { key: 'negativePerson', label: '不人気・苦手' },
  ]

  if (!matches.length) {
    return (
      <>
        <div className="match-filter-tabs" aria-label="完全一致結果の表示切替">
          {filters.map((filter) => (
            <button
              aria-pressed={activeFilter === filter.key}
              className={activeFilter === filter.key ? 'is-active' : ''}
              key={filter.key}
              type="button"
              onClick={() => onFilterChange(filter.key)}
            >
              {filter.label}
              <em>{counts[filter.key]}</em>
            </button>
          ))}
        </div>
        <div className="empty-result">
          <UsersThree size={18} weight="bold" />
          <span>{total ? 'この分類の該当はありません。' : '完全一致の該当はありません。'}</span>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="match-filter-tabs" aria-label="完全一致結果の表示切替">
        {filters.map((filter) => (
          <button
            aria-pressed={activeFilter === filter.key}
            className={activeFilter === filter.key ? 'is-active' : ''}
            key={filter.key}
            type="button"
            onClick={() => onFilterChange(filter.key)}
          >
            {filter.label}
            <em>{counts[filter.key]}</em>
          </button>
        ))}
      </div>
      <p className="match-summary">表示 {matches.length}件 / 該当 {total}件</p>
      <div className="match-list">
        {matches.map((match) => (
          <article className={`match-card ${match.group}`} key={match.id}>
            <div>
              <span>{match.groupLabel}</span>
              <strong>{match.term}</strong>
            </div>
            <p>
              {formatBarName(match.store.name)} / {match.snippet}
            </p>
          </article>
        ))}
      </div>
    </>
  )
}

function buildObservationLines(body: string) {
  const normalized = body.replace(/\s+/g, ' ').trim()
  if (!normalized) return { lines: ['まだ投稿がありません。'], restCount: 0 }

  const rawLines = normalized
    .replace(/(投稿者[:：])/g, '\n$1')
    .replace(/(\d{4}年\d{1,2}月\d{1,2}日\s*\d{1,2}:\d{2})/g, '\n$1')
    .replace(/(【[^】]+】)/g, '\n$1')
    .replace(/(本日の来店予告[:：]?)/g, '\n$1')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const lines = (rawLines.length ? rawLines : [normalized]).slice(0, 8).map((line) => (line.length > 86 ? `${line.slice(0, 86)}…` : line))

  return {
    lines,
    restCount: Math.max(0, rawLines.length - lines.length),
  }
}

function LatestPost({ source, body }: { source: string; body: string }) {
  const { lines, restCount } = buildObservationLines(body)

  return (
    <section className="latest-card">
      <div className="section-heading">
        <span>直近ログ</span>
        <h2>直近の観測ログ</h2>
      </div>
      <div className="log-ribbon">
        <span>{source}</span>
        <div className="log-copy">
          <ul>
            {lines.map((line, index) => (
              <li key={`${line}-${index}`}>{line}</li>
            ))}
          </ul>
          {restCount > 0 && <small>ほか {restCount} 件の断片を省略</small>}
        </div>
      </div>
    </section>
  )
}
