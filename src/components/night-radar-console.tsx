'use client'

import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { motion } from 'motion/react'
import {
  BellRinging,
  Broadcast,
  CalendarDots,
  ChartBarHorizontal,
  ChartLineUp,
  ClipboardText,
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
  Plus,
  ShieldCheck,
  Sparkle,
  Storefront,
  StripeLogo,
  Trash,
  UploadSimple,
  UsersThree,
  WarningCircle,
  XLogo,
} from '@phosphor-icons/react'
import { csvTemplates } from '@/lib/csv'
import { plans } from '@/lib/demo-data'
import { buildStoreBbsAnalytics, parseExactTerms, searchExactBbsTerms, summarizeSignals } from '@/lib/scoring'
import type {
  AiAnalysis,
  BbsSource,
  DashboardState,
  ExactTermMatch,
  ExactTermState,
  EventInput,
  NotificationJob,
  PostRecord,
  RuntimeMode,
  ScoredEvent,
  StoreBbsAnalytics,
  StoreProfile,
  StoreSituation,
} from '@/lib/types'
import './night-radar-console.css'

type CsvKind = 'stores' | 'events' | 'posts'
type ApiState = { tone: 'idle' | 'good' | 'warn'; message: string }
type ViewKey = 'radar' | 'analytics' | 'capture' | 'automate' | 'account'

type Props = {
  initialState: DashboardState
}

const weekdays = ['月曜', '火曜', '水曜', '木曜', '金曜', '土曜', '日曜']
const eventCategories = ['初心者系', '昼主婦系', '女性無料系', 'カップル系', 'SM系', 'コスプレ系', '平日穴場系']

const navItems: Array<{ key: ViewKey; label: string; icon: ReactNode }> = [
  { key: 'radar', label: 'Radar', icon: <Crosshair size={20} weight="bold" /> },
  { key: 'analytics', label: 'BBS', icon: <ChartBarHorizontal size={20} weight="bold" /> },
  { key: 'capture', label: 'Capture', icon: <Plus size={20} weight="bold" /> },
  { key: 'automate', label: 'Flow', icon: <MagicWand size={20} weight="bold" /> },
  { key: 'account', label: 'Plan', icon: <StripeLogo size={20} weight="bold" /> },
]

const exactTermLabels = {
  popularSingleMale: '人気単男',
  popularSingleFemale: '人気単女',
  negativePerson: '不人気・苦手',
} as const

const situationStatuses: Array<{ value: StoreSituation['status']; label: string }> = [
  { value: 'open', label: '通常営業' },
  { value: 'event', label: 'イベント' },
  { value: 'crowded', label: '盛況' },
  { value: 'watch', label: '要観測' },
  { value: 'closed', label: '休止/不明' },
]

function splitList(value: FormDataEntryValue | null) {
  return String(value ?? '')
    .split(/[,\n、]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

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
  const [stores, setStores] = useState(initialStores)
  const [events, setEvents] = useState(initialEvents)
  const [posts, setPosts] = useState(initialPosts)
  const [scoredEvents, setScoredEvents] = useState(initialScoredEvents)
  const [situations, setSituations] = useState(initialSituations)
  const [bbsSources, setBbsSources] = useState<BbsSource[]>(initialState.bbsSources)
  const [exactTerms, setExactTerms] = useState<ExactTermState>(initialState.exactTerms)
  const [serverMatches, setServerMatches] = useState<ExactTermMatch[]>([])
  const [csvKind, setCsvKind] = useState<CsvKind>('posts')
  const [csvText, setCsvText] = useState(csvTemplates.posts)
  const [scrapeUrl, setScrapeUrl] = useState('')
  const [scrapeStoreId, setScrapeStoreId] = useState(initialStores[0]?.id ?? '')
  const [analysisText, setAnalysisText] = useState(initialPosts[0]?.body ?? '')
  const [analysis, setAnalysis] = useState<AiAnalysis | null>(null)
  const [email, setEmail] = useState(initialState.userEmail ?? '')
  const [apiState, setApiState] = useState<ApiState>({
    tone: initialState.connectionNote ? 'warn' : 'idle',
    message: initialState.connectionNote ?? (initialState.mode === 'database' ? 'synced' : 'ready'),
  })
  const [jobs, setJobs] = useState<NotificationJob[]>(initialState.notificationJobs)
  const [busy, setBusy] = useState('')

  const summary = useMemo(() => summarizeSignals(scoredEvents), [scoredEvents])
  const storeAnalytics = useMemo(() => buildStoreBbsAnalytics(stores, posts), [stores, posts])
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
  const latestPost = posts[0]
  const activeWords = wordCategories.filter((word) =>
    posts.some((post) => word.examples.some((example) => post.body.includes(example))),
  )
  const visibleWords = activeWords.length ? activeWords : wordCategories.slice(0, 5)
  const radarScore = featuredEvent?.score ?? 0
  const busyLabel = busy ? '処理中…' : apiState.message
  const modeLabel = mode === 'database' ? 'DB保存中' : mode === 'anonymous' ? 'ログイン待ち' : 'デモ'

  function flash(message: string, tone: ApiState['tone'] = 'good') {
    setApiState({ message, tone })
  }

  function applyMode(nextMode?: RuntimeMode, message?: string) {
    if (nextMode) setMode(nextMode)
    if (message) flash(message, nextMode === 'database' ? 'good' : 'warn')
  }

  async function addStore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const name = String(form.get('name') ?? '').trim()
    if (!name) return flash('店舗名が必要です。', 'warn')

    const item: StoreProfile = {
      id: crypto.randomUUID(),
      name,
      area: String(form.get('area') ?? '未設定'),
      hasDaytime: form.get('hasDaytime') === 'on',
      hasNight: form.get('hasNight') === 'on',
      openingHourDay: String(form.get('openingHourDay') ?? '13:00'),
      openingHourNight: String(form.get('openingHourNight') ?? '19:00'),
      prStructure: String(form.get('prStructure') ?? '未分類'),
      strongDays: splitList(form.get('strongDays')),
      strongEvents: splitList(form.get('strongEvents')),
      weakEvents: splitList(form.get('weakEvents')),
      trustSeed: Number(form.get('trustSeed') ?? 60),
    }

    setBusy('store')
    try {
      const result = await postJson<{ item: StoreProfile; mode?: RuntimeMode; message?: string }>('/api/records', {
        kind: 'stores',
        item,
      })
      setStores((current) => [result.item, ...current.filter((store) => store.id !== result.item.id)])
      if (!scrapeStoreId) setScrapeStoreId(result.item.id)
      event.currentTarget.reset()
      applyMode(result.mode, result.message)
      if (!result.message) flash('店舗データを保存しました。')
    } catch (error) {
      flash(error instanceof Error ? error.message : '店舗保存に失敗しました。', 'warn')
    } finally {
      setBusy('')
    }
  }

  async function addEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const title = String(form.get('title') ?? '').trim()
    if (!title) return flash('イベント名が必要です。', 'warn')

    const item: EventInput = {
      id: crypto.randomUUID(),
      storeId: String(form.get('storeId')),
      date: String(form.get('date') || '今日'),
      weekday: String(form.get('weekday') || '未設定'),
      startsAt: String(form.get('startsAt') || '19:00'),
      session: String(form.get('session')) === 'day' ? 'day' : 'night',
      category: String(form.get('category') || '未分類'),
      title,
      sourceUrl: String(form.get('sourceUrl') || ''),
    }

    setBusy('event')
    try {
      const result = await postJson<{ item: EventInput; mode?: RuntimeMode; message?: string }>('/api/records', {
        kind: 'events',
        item,
      })
      setEvents((current) => [result.item, ...current.filter((entry) => entry.id !== result.item.id)])
      event.currentTarget.reset()
      applyMode(result.mode, result.message)
      if (!result.message) flash('イベントを保存しました。')
    } catch (error) {
      flash(error instanceof Error ? error.message : 'イベント保存に失敗しました。', 'warn')
    } finally {
      setBusy('')
    }
  }

  async function addPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const body = String(form.get('body') ?? '').trim()
    if (!body) return flash('投稿本文が必要です。', 'warn')

    const item: PostRecord = {
      id: crypto.randomUUID(),
      storeId: String(form.get('storeId')),
      source: 'manual',
      postedAt: new Date().toISOString(),
      body,
      keywords: splitList(form.get('keywords')),
    }

    setBusy('post')
    try {
      const result = await postJson<{ item: PostRecord; mode?: RuntimeMode; message?: string }>('/api/records', {
        kind: 'posts',
        item,
      })
      setPosts((current) => [result.item, ...current.filter((post) => post.id !== result.item.id)])
      event.currentTarget.reset()
      applyMode(result.mode, result.message)
      if (!result.message) flash('投稿データを保存しました。')
    } catch (error) {
      flash(error instanceof Error ? error.message : '投稿保存に失敗しました。', 'warn')
    } finally {
      setBusy('')
    }
  }

  async function addSituation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const title = String(form.get('title') ?? '').trim()
    if (!title) return flash('状況タイトルが必要です。', 'warn')

    const item: StoreSituation = {
      id: crypto.randomUUID(),
      storeId: String(form.get('storeId')),
      status: String(form.get('status') || 'watch') as StoreSituation['status'],
      title,
      note: String(form.get('note') ?? ''),
      sourceUrl: String(form.get('sourceUrl') ?? ''),
      observedAt: new Date().toISOString(),
    }

    setBusy('situation')
    try {
      const result = await postJson<{ item: StoreSituation; mode?: RuntimeMode; message?: string }>('/api/records', {
        kind: 'situations',
        item,
      })
      setSituations((current) => [result.item, ...current.filter((situation) => situation.id !== result.item.id)])
      event.currentTarget.reset()
      applyMode(result.mode, result.message)
      if (!result.message) flash('店舗状況を保存しました。')
    } catch (error) {
      flash(error instanceof Error ? error.message : '店舗状況の保存に失敗しました。', 'warn')
    } finally {
      setBusy('')
    }
  }

  async function deleteSituation(id: string) {
    if (!window.confirm('この店舗状況を削除しますか？')) return
    setBusy('delete-situation')
    try {
      const result = await deleteJson<{ mode?: RuntimeMode; message?: string }>('/api/records', {
        kind: 'situations',
        id,
      })
      setSituations((current) => current.filter((situation) => situation.id !== id))
      applyMode(result.mode, result.message)
      if (!result.message) flash('店舗状況を削除しました。')
    } catch (error) {
      flash(error instanceof Error ? error.message : '店舗状況の削除に失敗しました。', 'warn')
    } finally {
      setBusy('')
    }
  }

  async function importCsv() {
    setBusy('csv')
    try {
      const result = await postJson<{ items: unknown[]; errors: string[] }>('/api/csv/import', {
        kind: csvKind,
        text: csvText,
        persist: true,
      })
      if (result.errors.length) {
        flash(`CSVに${result.errors.length}件のエラーがあります。`, 'warn')
      }
      if (csvKind === 'stores') setStores((current) => [...(result.items as StoreProfile[]), ...current])
      if (csvKind === 'events') setEvents((current) => [...(result.items as EventInput[]), ...current])
      if (csvKind === 'posts') setPosts((current) => [...(result.items as PostRecord[]), ...current])
      if (!result.errors.length) flash(`${result.items.length}件を取り込みました。`)
    } catch (error) {
      flash(error instanceof Error ? error.message : 'CSV取り込みに失敗しました。', 'warn')
    } finally {
      setBusy('')
    }
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

  async function runScrape() {
    const storeId = scrapeStoreId || stores[0]?.id
    if (!scrapeUrl || !storeId) return flash('URLと店舗データが必要です。', 'warn')
    setBusy('scrape')
    try {
      const result = await postJson<{ post: PostRecord | null; result: { status: string; message?: string } }>(
        '/api/scrape',
        {
          url: scrapeUrl,
          storeId,
          persist: true,
        },
      )
      if (result.post) setPosts((current) => [result.post!, ...current])
      flash(
        result.post ? 'スクレイピング結果を投稿として追加しました。' : result.result.message ?? '取得しました。',
        result.post ? 'good' : 'warn',
      )
    } catch (error) {
      flash(error instanceof Error ? error.message : 'スクレイピングに失敗しました。', 'warn')
    } finally {
      setBusy('')
    }
  }

  async function runAiAnalysis() {
    if (!analysisText.trim()) return flash('AI分析するテキストが必要です。', 'warn')
    setBusy('ai')
    try {
      const result = await postJson<{ analysis: AiAnalysis; mode: string }>('/api/ai/analyze', { text: analysisText })
      setAnalysis(result.analysis)
      flash(`AI分析を完了しました (${result.mode})。`)
    } catch (error) {
      flash(error instanceof Error ? error.message : 'AI分析に失敗しました。', 'warn')
    } finally {
      setBusy('')
    }
  }

  async function addBbsSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const item: BbsSource = {
      id: crypto.randomUUID(),
      storeId: String(form.get('storeId')),
      label: String(form.get('label') || 'BBS'),
      url: String(form.get('url') || ''),
      parserType: 'auto',
      active: true,
      crawlIntervalMinutes: Number(form.get('crawlIntervalMinutes') || 360),
      lastStatus: 'pending',
    }

    setBusy('bbs-source')
    try {
      const result = await postJson<{ item: BbsSource; mode?: RuntimeMode; message?: string }>('/api/records', {
        kind: 'bbsSources',
        item,
      })
      setBbsSources((current) => [result.item, ...current.filter((source) => source.id !== result.item.id)])
      event.currentTarget.reset()
      applyMode(result.mode, result.message)
      if (!result.message) flash('BBSソースを保存しました。')
    } catch (error) {
      flash(error instanceof Error ? error.message : 'BBSソース保存に失敗しました。', 'warn')
    } finally {
      setBusy('')
    }
  }

  async function crawlSources(sourceIds?: string[]) {
    setBusy('crawl')
    try {
      const result = await postJson<{
        mode?: RuntimeMode
        message?: string
        results: Array<{ source: BbsSource; post: PostRecord | null }>
      }>('/api/bbs-sources/crawl', { sourceIds })
      setBbsSources((current) =>
        current.map((source) => result.results.find((entry) => entry.source.id === source.id)?.source ?? source),
      )
      const newPosts = result.results.map((entry) => entry.post).filter((post): post is PostRecord => Boolean(post))
      if (newPosts.length) setPosts((current) => [...newPosts, ...current.filter((post) => !newPosts.some((next) => next.id === post.id))])
      applyMode(result.mode, result.message)
      flash(`${result.results.length}件のBBSソースを巡回しました。`, result.results.length ? 'good' : 'warn')
    } catch (error) {
      flash(error instanceof Error ? error.message : 'BBS巡回に失敗しました。', 'warn')
    } finally {
      setBusy('')
    }
  }

  async function saveExactTerms() {
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
      const result = await postJson<{ jobs: NotificationJob[]; mode?: RuntimeMode; message?: string }>('/api/notifications/dispatch', {
        channel: email ? 'email' : 'in_app',
        audience: 'light',
        recipient: email || undefined,
        events: scoredEvents,
      })
      setJobs(result.jobs)
      applyMode(result.mode, result.message)
      if (!result.message) flash('通知ジョブを作成しました。')
    } catch (error) {
      flash(error instanceof Error ? error.message : '通知配信に失敗しました。', 'warn')
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
          <motion.section
            className="view-stack"
            key="radar"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28 }}
          >
            <section className="radar-hero-card">
              <div className="radar-copy">
                <span>Live signal</span>
                <h1>今日、見るべき夜を先に出す。</h1>
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
              <ActionButton icon={<ChartBarHorizontal size={20} weight="bold" />} label="BBS" onClick={() => setView('analytics')} />
              <ActionButton icon={<Plus size={20} weight="bold" />} label="追加" onClick={() => setView('capture')} />
              <ActionButton icon={<BellRinging size={20} weight="bold" />} label="通知" onClick={sendNotifications} disabled={busy === 'notify'} />
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
          </motion.section>
        )}

        {view === 'analytics' && (
          <motion.section
            className="view-stack"
            key="analytics"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28 }}
          >
            <ViewIntro
              eyebrow="BBS"
              title="店舗別BBS"
              body="投稿量、曜日、完全一致ワードだけを見る。"
            />

            <section className="analytics-hero app-card">
              <div className="section-heading">
                <span>Pulse</span>
                <h2>盛り上がり</h2>
              </div>
              <div className="pulse-grid">
                {focusedStores.map((item) => (
                  <StorePulseCard item={item} key={item.store.id} />
                ))}
              </div>
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
                {visibleSituations.map((situation) => (
                  <SituationCard
                    key={situation.id}
                    situation={situation}
                    storeName={stores.find((store) => store.id === situation.storeId)?.name ?? '未登録店舗'}
                    onDelete={() => deleteSituation(situation.id)}
                  />
                ))}
              </div>
              <details className="compact-details">
                <summary>状況を追加</summary>
                <form className="nested-form" onSubmit={addSituation}>
                  <select name="storeId" aria-label="状況対象店舗">
                    {stores.map((store) => (
                      <option key={store.id} value={store.id}>
                        {store.name}
                      </option>
                    ))}
                  </select>
                  <select name="status" aria-label="状況種別">
                    {situationStatuses.map((status) => (
                      <option key={status.value} value={status.value}>
                        {status.label}
                      </option>
                    ))}
                  </select>
                  <input aria-label="状況タイトル" autoComplete="off" name="title" placeholder="状況…" />
                  <textarea aria-label="状況メモ" autoComplete="off" name="note" placeholder="メモ…" rows={3} />
                  <input aria-label="状況ソースURL" autoComplete="off" name="sourceUrl" placeholder="URL…" type="url" />
                  <button type="submit">
                    <Plus size={17} weight="bold" />
                    追加
                  </button>
                </form>
              </details>
            </section>

            <section className="app-card form-card">
              <FormTitle icon={<MagnifyingGlass size={19} weight="bold" />} title="完全一致検索" />
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
                保存して全BBS検索
              </button>
              <ExactMatchList matches={visibleMatches} />
            </section>
          </motion.section>
        )}

        {view === 'capture' && (
          <motion.section
            className="view-stack"
            key="capture"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28 }}
          >
            <ViewIntro eyebrow="Capture" title="入力は短く、判断材料は濃く。" body="店舗、イベント、投稿メモをカード単位で追加します。" />
            <form className="app-card form-card" onSubmit={addPost}>
              <FormTitle icon={<ClipboardText size={19} weight="bold" />} title="投稿メモ" />
              <select name="storeId" aria-label="投稿対象店舗">
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
              <textarea aria-label="投稿本文" name="body" placeholder="公開掲示板・店舗告知などの要約テキスト…" rows={5} />
              <input aria-label="投稿キーワード" autoComplete="off" name="keywords" placeholder="キーワード 例: 昼,主婦,初参加…" />
              <button type="submit">
                <Plus size={17} weight="bold" />
                投稿追加
              </button>
            </form>

            <form className="app-card form-card" onSubmit={addEvent}>
              <FormTitle icon={<CalendarDots size={19} weight="bold" />} title="イベント" />
              <select name="storeId" aria-label="店舗">
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
              <input aria-label="イベント名" autoComplete="off" name="title" placeholder="イベント名…" />
              <div className="inline-grid">
                <select name="weekday" aria-label="曜日">
                  {weekdays.map((weekday) => (
                    <option key={weekday}>{weekday}</option>
                  ))}
                </select>
                <select name="category" aria-label="カテゴリ">
                  {eventCategories.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </div>
              <div className="inline-grid">
                <input aria-label="イベント日付" autoComplete="off" name="date" placeholder="日付 例: 今日…" />
                <input aria-label="開始時刻" autoComplete="off" name="startsAt" placeholder="19:00…" />
              </div>
              <select name="session" aria-label="時間帯">
                <option value="day">昼</option>
                <option value="night">夜</option>
              </select>
              <button type="submit">
                <Plus size={17} weight="bold" />
                イベント追加
              </button>
            </form>

            <form className="app-card form-card" onSubmit={addStore}>
              <FormTitle icon={<Storefront size={19} weight="bold" />} title="店舗プロファイル" />
              <input aria-label="店舗名" autoComplete="off" name="name" placeholder="店舗名…" />
              <input aria-label="エリア" autoComplete="off" name="area" placeholder="エリア…" />
              <input aria-label="PR構造" autoComplete="off" name="prStructure" placeholder="PR構造 例: 具体型…" />
              <input aria-label="強い曜日" autoComplete="off" name="strongDays" placeholder="強い曜日 例: 火曜,金曜…" />
              <input aria-label="強いイベント" autoComplete="off" name="strongEvents" placeholder="強いイベント 例: 昼主婦系,初心者系…" />
              <input aria-label="弱いイベント" autoComplete="off" name="weakEvents" placeholder="弱いイベント…" />
              <div className="switch-row">
                <label>
                  <input name="hasDaytime" type="checkbox" defaultChecked />
                  昼営業
                </label>
                <label>
                  <input name="hasNight" type="checkbox" defaultChecked />
                  夜営業
                </label>
              </div>
              <button type="submit">
                <Plus size={17} weight="bold" />
                店舗追加
              </button>
            </form>
          </motion.section>
        )}

        {view === 'automate' && (
          <motion.section
            className="view-stack"
            key="automate"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28 }}
          >
            <ViewIntro eyebrow="Flow" title="取り込みから通知までを一本化。" body="CSV、公開HTML、AI分類、通知ジョブを同じ画面で扱います。" />

            <section className="app-card form-card">
              <FormTitle icon={<MagicWand size={19} weight="bold" />} title="AI分析" />
              <textarea aria-label="AI分析対象テキスト" value={analysisText} onChange={(event) => setAnalysisText(event.target.value)} rows={5} />
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
              <FormTitle icon={<FileCsv size={19} weight="bold" />} title="CSV取り込み" />
              <div className="inline-grid">
                <select
                  value={csvKind}
                  onChange={(event) => {
                    const next = event.target.value as CsvKind
                    setCsvKind(next)
                    setCsvText(csvTemplates[next])
                  }}
                  aria-label="CSV種別"
                >
                  <option value="stores">店舗CSV</option>
                  <option value="events">イベントCSV</option>
                  <option value="posts">投稿CSV</option>
                </select>
                <button type="button" onClick={importCsv} disabled={busy === 'csv'}>
                  <UploadSimple size={17} weight="bold" />
                  取り込む
                </button>
              </div>
              <textarea aria-label="CSVテキスト" value={csvText} onChange={(event) => setCsvText(event.target.value)} rows={7} />
            </section>

            <section className="app-card form-card">
              <FormTitle icon={<GlobeHemisphereEast size={19} weight="bold" />} title="スクレイピング" />
              <select value={scrapeStoreId} onChange={(event) => setScrapeStoreId(event.target.value)} aria-label="取得対象店舗">
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
              <input
                aria-label="公開ページURL"
                autoComplete="off"
                placeholder="公開ページURL…"
                type="url"
                value={scrapeUrl}
                onChange={(event) => setScrapeUrl(event.target.value)}
              />
              <button type="button" onClick={runScrape} disabled={busy === 'scrape'}>
                <Broadcast size={17} weight="bold" />
                取得して投稿化
              </button>
              <p className="muted-note">公開HTMLのみ。localhost/private IPはSSRF対策でブロックします。</p>
            </section>

            <section className="app-card form-card">
              <FormTitle icon={<Broadcast size={19} weight="bold" />} title="BBS巡回ソース" />
              <form className="nested-form" onSubmit={addBbsSource}>
                <select name="storeId" aria-label="BBS対象店舗">
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                </select>
                <input aria-label="BBSソースラベル" autoComplete="off" name="label" placeholder="ラベル 例: 公式BBS…" />
                <input aria-label="BBS URL" autoComplete="off" name="url" placeholder="BBS URL…" type="url" />
                <input
                  aria-label="巡回間隔"
                  autoComplete="off"
                  min={15}
                  name="crawlIntervalMinutes"
                  placeholder="巡回間隔 分…"
                  type="number"
                />
                <button type="submit" disabled={busy === 'bbs-source'}>
                  <Plus size={17} weight="bold" />
                  ソース保存
                </button>
              </form>
              <div className="source-list">
                {bbsSources.length ? (
                  bbsSources.slice(0, 8).map((source) => (
                    <article key={source.id}>
                      <div>
                        <strong>{source.label}</strong>
                        <span>{stores.find((store) => store.id === source.storeId)?.name ?? '未登録'} / {source.lastStatus ?? 'pending'}</span>
                      </div>
                      <button type="button" onClick={() => crawlSources([source.id])} disabled={busy === 'crawl'}>
                        巡回
                      </button>
                    </article>
                  ))
                ) : (
                  <p className="muted-note">店舗ごとのBBS URLを保存すると、定期巡回の対象になります。</p>
                )}
              </div>
              <button className="secondary-action" type="button" onClick={() => crawlSources()} disabled={busy === 'crawl' || !bbsSources.length}>
                全ソース巡回
              </button>
            </section>

            <section className="app-card form-card">
              <FormTitle icon={<BellRinging size={19} weight="bold" />} title="通知配信" />
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
          </motion.section>
        )}

        {view === 'account' && (
          <motion.section
            className="view-stack"
            key="account"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28 }}
          >
            <ViewIntro eyebrow="Account" title="認証、課金、公開情報ポリシー。" body="X、Google、メール認証とStripeプランを接続できます。" />

            <section className="app-card form-card">
              <FormTitle icon={<ShieldCheck size={19} weight="bold" />} title="認証" />
              <div className="account-state">
                <span>{initialState.userEmail ? initialState.userEmail : '未ログイン'}</span>
                <strong>{subscription.plan} / {subscription.status}</strong>
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

            <section className="plan-stack">
              {plans
                .filter((plan): plan is (typeof plans)[number] & { key: 'light' | 'standard' | 'premium' } => plan.key !== 'free')
                .map((plan) => (
                  <button className="plan-card" key={plan.key} type="button" onClick={() => checkout(plan.key)}>
                    <span>
                      <StripeLogo size={20} weight="bold" />
                      {plan.label}
                    </span>
                    <strong>{plan.price}</strong>
                    <small>{plan.summary}</small>
                  </button>
                ))}
            </section>

            <button className="billing-portal-button" type="button" onClick={openBillingPortal} disabled={busy === 'portal'}>
              <StripeLogo size={18} weight="bold" />
              請求ポータルを開く
            </button>

            <section className="legal-note">
              <WarningCircle size={18} weight="bold" />
              <p>
                本サービスは公開情報の店舗・イベント単位集計です。個人追跡、来店保証、違法行為の助長は扱いません。
                <a href="/terms">利用規約</a>
                <a href="/privacy">プライバシー</a>
              </p>
            </section>
          </motion.section>
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

function StorePulseCard({ item }: { item: StoreBbsAnalytics }) {
  return (
    <article className="store-pulse-card">
      <div className="pulse-head">
        <span>
          <Storefront size={17} weight="bold" />
          {item.store.name}
        </span>
        <em>{item.verdict}</em>
      </div>
      <div className="pulse-score">
        <strong>{item.excitement}</strong>
        <span>pulse</span>
      </div>
      <div className="ratio-track" aria-label={`書き込み数比率 ${item.postRatio}%`}>
        <i style={{ inlineSize: `${item.postRatio}%` }} />
      </div>
      <dl className="pulse-metrics">
        <div>
          <dt>投稿</dt>
          <dd>{item.postCount}</dd>
        </div>
        <div>
          <dt>比率</dt>
          <dd>{item.postRatio}%</dd>
        </div>
        <div>
          <dt>曜日</dt>
          <dd>{item.dominantWeekday.replace('曜', '')}</dd>
        </div>
      </dl>
    </article>
  )
}

function SituationCard({
  situation,
  storeName,
  onDelete,
}: {
  situation: StoreSituation
  storeName: string
  onDelete: () => void
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
      <button type="button" onClick={onDelete} aria-label={`${situation.title}を削除`}>
        <Trash size={17} weight="bold" />
      </button>
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
