'use client'

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import {
  Broadcast,
  CalendarDots,
  CaretDown,
  ChartLineUp,
  Crosshair,
  Lightning,
  List,
  MagnifyingGlass,
  ShieldCheck,
  Star,
  Storefront,
  Trash,
  UsersThree,
  WarningCircle,
  X,
} from '@phosphor-icons/react'
import {
  dateKeyInJapan,
  daysInMonthInJapan,
  dateFromJapanParts,
  eventWeekday,
  formatEventDateLabel,
  monthKeyInJapan,
  relativeDateInJapan,
  weekdayIndexForJapanDate,
  weekdayLabelForJapanDate,
} from '@/lib/date'
import { planLimits } from '@/lib/plans'
import {
  buildStoreBbsAnalytics,
  buildStoreRadarPoints,
  buildSearchableBbsRecords,
  buildWatchedWordHits,
  defaultWatchedTemplateKeys,
  extractWatchedAuthorEntries,
  extractWatchedAuthorText,
  filterPostsForBusinessDay,
  filterPostsWithinHours,
  filterSnapshotsForBusinessDay,
  normalizeWatchedSearchText,
  parseExactTerms,
  prioritizeScoredEventsForToday,
  searchExactBbsTerms,
  summarizeSignals,
  watchedTemplateRules,
  type WatchedTemplateKey,
} from '@/lib/scoring'
import { formatBarName, formatStoreArea, formatStoreSessionLabel } from '@/lib/display'
import type {
  BbsSnapshot,
  BbsSource,
  DashboardState,
  ExactTermMatch,
  ExactTermGroup,
  ExactTermState,
  EventInput,
  PlanKey,
  PostRecord,
  RuntimeMode,
  ScoredEvent,
  StoreDecisionState,
  StoreProfile,
  StoreBbsAnalytics,
  StoreRadarPoint,
  WatchedWordHit,
  WordBookmark,
} from '@/lib/types'
import './night-radar-console.css'

type ApiState = { tone: 'idle' | 'good' | 'warn'; message: string }
type ViewKey = 'radar' | 'analytics' | 'capture' | 'automate' | 'account'
type NavKey = 'today' | 'search' | 'calendar' | 'stores' | 'settings'
type ExactMatchFilter = ExactTermGroup | 'all'
type StoreSortKey = 'hot' | 'share' | 'signals' | 'updated'
type StoreSessionFilter = 'all' | 'current' | 'day' | 'night'
type StoreSignalFilter = 'all' | 'female' | 'event' | 'budget'
type SourceHealth = { ok: number; stale: number; blocked: number; failed: number; pending: number; total: number }
type MetricTone = 'good' | 'warn' | 'muted'
type DecisionMetric = { label: string; value: string; tone?: MetricTone }
type DecisionStoreKind = 'go' | 'maybe' | 'skip'
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}
type GenderPostRanking = {
  store: StoreProfile
  rank: number
  observedCount: number
  rawEstimate: number
  recordCount: number
  femaleSignals: number
  maleSignals: number
  femaleRatio: number
  maleRatio: number
  signalTotal: number
  verdict: string
}

type Props = {
  calendarEvents?: EventInput[]
  initialState: DashboardState
}

const navItems: Array<{ key: NavKey; view: ViewKey; label: string; icon: ReactNode; targetId?: string }> = [
  { key: 'today', view: 'analytics', label: '今日', icon: <Broadcast size={20} weight="bold" /> },
  { key: 'stores', view: 'capture', label: '探す', icon: <Storefront size={20} weight="bold" /> },
  { key: 'search', view: 'automate', label: '監視', icon: <MagnifyingGlass size={20} weight="bold" /> },
  { key: 'calendar', view: 'analytics', label: '予定', icon: <CalendarDots size={20} weight="bold" /> },
  { key: 'settings', view: 'account', label: '設定', icon: <ShieldCheck size={20} weight="bold" /> },
]

const navScreenCopy: Record<NavKey, { title: string; body: string }> = {
  today: { title: '今日の結論', body: '今日行くなら、迷うなら、後回しにするなら。この3つだけを先に見ます。' },
  stores: { title: '探す', body: '店舗検索ではなく、今夜の行き先を条件で決める画面です。' },
  search: { title: '監視', body: '気になる名前や呼び名だけを、直近24時間の投稿者名から確認します。' },
  calendar: { title: '予定', body: '月間イベントを日付単位で確認します。詳細は開いた時だけ表示します。' },
  settings: { title: '設定', body: 'ログイン状態、店舗マスタ、公開情報の扱いを確認します。' },
}

const exactTermLabels = {
  popularSingleMale: '人気単独男性',
  popularSingleFemale: '人気単独女性',
  negativePerson: '不人気・苦手',
} as const
const installReminderStorageKey = 'night-radar-install-reminder-dismissed-at'
const installReminderIntervalMs = 1000 * 60 * 60 * 24 * 7

const bodyScrollLockState = {
  count: 0,
  overflow: '',
  paddingRight: '',
}

function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked || typeof window === 'undefined') return

    if (bodyScrollLockState.count === 0) {
      bodyScrollLockState.overflow = document.body.style.overflow
      bodyScrollLockState.paddingRight = document.body.style.paddingRight

      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
      document.body.style.overflow = 'hidden'
      if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`
    }

    bodyScrollLockState.count += 1

    return () => {
      bodyScrollLockState.count = Math.max(0, bodyScrollLockState.count - 1)
      if (bodyScrollLockState.count > 0) return

      document.body.style.overflow = bodyScrollLockState.overflow
      document.body.style.paddingRight = bodyScrollLockState.paddingRight
      bodyScrollLockState.overflow = ''
      bodyScrollLockState.paddingRight = ''
    }
  }, [locked])
}

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

function buildSourceHealth(sources: BbsSource[]): SourceHealth {
  return sources.reduce<SourceHealth>(
    (health, source) => {
      const status = source.lastStatus ?? 'pending'
      if (status === 'ok') {
        if (isSourceStale(source)) health.stale += 1
        else health.ok += 1
      }
      else if (status === 'blocked') health.blocked += 1
      else if (status === 'failed') health.failed += 1
      else health.pending += 1
      health.total += 1
      return health
    },
    { ok: 0, stale: 0, blocked: 0, failed: 0, pending: 0, total: 0 },
  )
}

function sourceHealthLabel(health: SourceHealth) {
  if (!health.total) return '取得待ち'
  const trouble = health.blocked + health.failed
  if (!trouble && !health.stale && health.ok === health.total) return '取得成功'
  if (!trouble && health.stale > 0 && health.ok + health.stale === health.total) return '取得古い'
  if (health.stale > 0) return '一部古い'
  if (health.ok > 0) return '一部未取得'
  return '取得不可'
}

function isSourceStale(source?: BbsSource) {
  if (!source?.lastFetchedAt) return false
  const fetchedAt = new Date(source.lastFetchedAt).getTime()
  if (Number.isNaN(fetchedAt)) return false
  return Date.now() - fetchedAt > 1000 * 60 * 60 * 6
}

async function postJson<T>(url: string, payload: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const json = await response.json()
  if (!response.ok) throw new Error(json.error ?? '通信に失敗しました。')
  return json as T
}

async function deleteJson<T>(url: string, payload: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const json = await response.json()
  if (!response.ok) throw new Error(json.error ?? '通信に失敗しました。')
  return json as T
}

export function NightRadarConsole({ calendarEvents: initialCalendarEvents, initialState }: Props) {
  const initialStores = initialState.stores
  const initialEvents = initialState.events
  const calendarEvents = initialCalendarEvents?.length ? initialCalendarEvents : initialEvents
  const initialPosts = initialState.posts
  const initialScoredEvents = initialState.scoredEvents
  const wordCategories = initialState.wordCategories
  const subscription = initialState.subscription
  const signedInUserKey = initialState.userId ?? initialState.userEmail
  const signedInLabel = initialState.userEmail ?? initialState.userDisplayName
  const isSignedIn = Boolean(signedInUserKey)
  const storeDecisionStorageKey = `night-radar-store-decisions:${signedInUserKey ?? 'anonymous'}`
  const firstGuideStorageKey = `night-radar-first-guide:${signedInUserKey ?? 'anonymous'}`
  const watchedTemplateStorageKey = `night-radar-watched-templates:${signedInUserKey ?? 'anonymous'}`
  const [view, setView] = useState<ViewKey>('analytics')
  const [activeNav, setActiveNav] = useState<NavKey>('today')
  const [mode, setMode] = useState<RuntimeMode>(initialState.mode)
  const [stores] = useState(initialStores)
  const [events] = useState(initialEvents)
  const [posts] = useState(initialPosts)
  const [scoredEvents, setScoredEvents] = useState(initialScoredEvents)
  const [bbsSources] = useState<BbsSource[]>(initialState.bbsSources)
  const [exactTerms, setExactTerms] = useState<ExactTermState>(initialState.exactTerms)
  const [serverMatches, setServerMatches] = useState<ExactTermMatch[] | null>(null)
  const [exactMatchFilter, setExactMatchFilter] = useState<ExactMatchFilter>('all')
  const [apiState, setApiState] = useState<ApiState>({
    tone: initialState.connectionNote ? 'warn' : 'idle',
    message: initialState.connectionNote ?? (initialState.mode === 'database' ? '同期済み' : '待機中'),
  })
  const [bbsSnapshots] = useState<BbsSnapshot[]>(initialState.bbsSnapshots)
  const [bbsNormalizedPosts] = useState(initialState.bbsNormalizedPosts ?? [])
  const [wordBookmarks, setWordBookmarks] = useState<WordBookmark[]>(initialState.wordBookmarks)
  const [bookmarkDraft, setBookmarkDraft] = useState('')
  const [watchSearchTerm, setWatchSearchTerm] = useState('')
  const [watchStoreId, setWatchStoreId] = useState('all')
  const [enabledWatchedTemplates, setEnabledWatchedTemplates] = useState<WatchedTemplateKey[]>(() => {
    if (typeof window === 'undefined') return [...defaultWatchedTemplateKeys]
    try {
      const stored = window.localStorage.getItem(watchedTemplateStorageKey)
      if (!stored) return [...defaultWatchedTemplateKeys]
      const knownKeys = new Set<WatchedTemplateKey>(defaultWatchedTemplateKeys)
      const parsed = JSON.parse(stored) as string[]
      if (!Array.isArray(parsed)) return [...defaultWatchedTemplateKeys]
      return parsed.filter((key): key is WatchedTemplateKey => knownKeys.has(key as WatchedTemplateKey))
    } catch {
      window.localStorage.removeItem(watchedTemplateStorageKey)
      return [...defaultWatchedTemplateKeys]
    }
  })
  const [storeQuery, setStoreQuery] = useState('')
  const [storeSort, setStoreSort] = useState<StoreSortKey>('hot')
  const [storeSessionFilter, setStoreSessionFilter] = useState<StoreSessionFilter>('all')
  const [storeSignalFilter, setStoreSignalFilter] = useState<StoreSignalFilter>('all')
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null)
  const [storeDecisions, setStoreDecisions] = useState<Record<string, StoreDecisionState>>(() => {
    const initialDecisions = initialState.storeDecisions ?? {}
    if (typeof window === 'undefined') return initialDecisions
    try {
      const stored = window.localStorage.getItem(storeDecisionStorageKey)
      if (!stored) return initialDecisions
      const parsed = JSON.parse(stored) as Record<string, StoreDecisionState>
      return { ...parsed, ...initialDecisions }
    } catch {
      window.localStorage.removeItem(storeDecisionStorageKey)
      return initialDecisions
    }
  })
  const [showFirstGuide, setShowFirstGuide] = useState(false)
  const [busy, setBusy] = useState('')
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showInstallReminder, setShowInstallReminder] = useState(false)
  const [showInstallGuide, setShowInstallGuide] = useState(false)

  useEffect(() => {
    window.localStorage.setItem(storeDecisionStorageKey, JSON.stringify(storeDecisions))
  }, [storeDecisionStorageKey, storeDecisions])

  useEffect(() => {
    window.localStorage.setItem(watchedTemplateStorageKey, JSON.stringify(enabledWatchedTemplates))
  }, [enabledWatchedTemplates, watchedTemplateStorageKey])

  useEffect(() => {
    if (!isSignedIn) return
    if (window.localStorage.getItem(firstGuideStorageKey)) return
    const guideTimer = window.setTimeout(() => setShowFirstGuide(true), 0)
    return () => window.clearTimeout(guideTimer)
  }, [firstGuideStorageKey, isSignedIn])

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    if (isStandalone) return

    const dismissedAt = Number(window.localStorage.getItem(installReminderStorageKey) ?? 0)
    const reminderTimer =
      !dismissedAt || Date.now() - dismissedAt > installReminderIntervalMs
        ? window.setTimeout(() => setShowInstallReminder(true), 0)
        : undefined

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
      setShowInstallReminder(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    return () => {
      if (reminderTimer) window.clearTimeout(reminderTimer)
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    }
  }, [])

  const todayOrderedScoredEvents = useMemo(() => prioritizeScoredEventsForToday(scoredEvents), [scoredEvents])
  const summary = useMemo(() => summarizeSignals(scoredEvents), [scoredEvents])
  const businessDayPosts = useMemo(
    () => filterPostsForBusinessDay(posts, initialState.setupStatus.generatedAt),
    [initialState.setupStatus.generatedAt, posts],
  )
  const businessDaySnapshots = useMemo(
    () => filterSnapshotsForBusinessDay(bbsSnapshots, initialState.setupStatus.generatedAt),
    [bbsSnapshots, initialState.setupStatus.generatedAt],
  )
  const storeAnalytics = useMemo(() => buildStoreBbsAnalytics(stores, businessDayPosts), [businessDayPosts, stores])
  const storeRadar = useMemo(
    () => buildStoreRadarPoints(stores, businessDayPosts, businessDaySnapshots),
    [businessDayPosts, businessDaySnapshots, stores],
  )
  const storeAnalyticsById = useMemo(
    () => new Map(storeAnalytics.map((item) => [item.store.id, item])),
    [storeAnalytics],
  )
  const bbsSourceByStoreId = useMemo(() => {
    const map = new Map<string, BbsSource>()
    bbsSources.forEach((source) => {
      if (!map.has(source.storeId) || source.lastStatus === 'ok') map.set(source.storeId, source)
    })
    return map
  }, [bbsSources])
  const eventCountByStoreId = useMemo(() => buildEventCountByStore(calendarEvents), [calendarEvents])
  const todayEventCountByStoreId = useMemo(() => buildEventCountByStore(calendarEvents, eventMatchesToday), [calendarEvents])
  const normalizedStoreIds = useMemo(() => new Set(bbsNormalizedPosts.map((post) => post.storeId)), [bbsNormalizedPosts])
  const searchableBbsSnapshots = useMemo(
    () => (normalizedStoreIds.size ? bbsSnapshots.filter((snapshot) => !normalizedStoreIds.has(snapshot.storeId)) : bbsSnapshots),
    [bbsSnapshots, normalizedStoreIds],
  )
  const searchableBbsRecords = useMemo(() => buildSearchableBbsRecords(posts, searchableBbsSnapshots), [posts, searchableBbsSnapshots])
  const recentWatchedBbsRecords = useMemo(
    () => filterPostsWithinHours(searchableBbsRecords, initialState.setupStatus.generatedAt, 24),
    [initialState.setupStatus.generatedAt, searchableBbsRecords],
  )
  const genderPostRankings = useMemo(
    () => buildGenderPostRankings(businessDayPosts, stores),
    [businessDayPosts, stores],
  )
  const genderRankingByStoreId = useMemo(
    () => new Map(genderPostRankings.map((ranking) => [ranking.store.id, ranking])),
    [genderPostRankings],
  )
  const filteredStoreRadar = useMemo(() => {
    const query = normalizeLocalSearchText(storeQuery)
    const filtered = storeRadar.filter((point) => {
      const genderRanking = genderRankingByStoreId.get(point.store.id)
      const displaySignals = getDisplaySignalCounts(point, genderRanking)

      if (storeDecisions[point.store.id] === 'hidden') return false

      if (query) {
        const haystack = normalizeLocalSearchText(
          [point.store.name, point.store.area, point.store.prStructure, point.verdict].join(' '),
        )
        if (!haystack.includes(query)) return false
      }

      if (!isStoreAvailableForSession(point.store, storeSessionFilter)) return false

      if (storeSignalFilter === 'female' && displaySignals.female < 1) return false
      if (storeSignalFilter === 'event' && !(eventCountByStoreId.get(point.store.id) ?? 0)) return false
      if (storeSignalFilter === 'budget' && !isAffordableStore(point.store)) return false

      return true
    })

    return filtered.toSorted((a, b) => {
      const bGenderRanking = genderRankingByStoreId.get(b.store.id)
      const aGenderRanking = genderRankingByStoreId.get(a.store.id)
      const bFemalePosts = bGenderRanking?.femaleSignals ?? 0
      const aFemalePosts = aGenderRanking?.femaleSignals ?? 0

      if (storeSort === 'share') return b.share - a.share || b.score - a.score
      if (storeSort === 'signals') {
        const bAttention = getDisplayAttentionCount(b, bGenderRanking)
        const aAttention = getDisplayAttentionCount(a, aGenderRanking)
        return bAttention - aAttention || b.score - a.score
      }
      if (storeSort === 'updated') {
        const bTime = b.lastCapturedAt ? new Date(b.lastCapturedAt).getTime() : 0
        const aTime = a.lastCapturedAt ? new Date(a.lastCapturedAt).getTime() : 0
        return bTime - aTime || b.score - a.score
      }
      return bFemalePosts - aFemalePosts || b.score - a.score || b.share - a.share
    })
  }, [eventCountByStoreId, genderRankingByStoreId, storeDecisions, storeQuery, storeRadar, storeSessionFilter, storeSignalFilter, storeSort])
  const watchedWordHits = useMemo(
    () =>
      buildWatchedWordHits(recentWatchedBbsRecords, stores, wordBookmarks, {
        enabledTemplateKeys: enabledWatchedTemplates,
        storeId: watchStoreId,
      }),
    [enabledWatchedTemplates, recentWatchedBbsRecords, stores, watchStoreId, wordBookmarks],
  )
  const searchedWatchedWordHits = useMemo(
    () => buildCustomWatchedWordHits(recentWatchedBbsRecords, stores, watchSearchTerm, watchStoreId),
    [recentWatchedBbsRecords, stores, watchSearchTerm, watchStoreId],
  )
  const exactMatches = useMemo(
    () =>
      searchExactBbsTerms(recentWatchedBbsRecords, stores, [
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
    [exactTerms, recentWatchedBbsRecords, stores],
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
  const featuredEvent = todayOrderedScoredEvents[0] ?? summary.dayTop ?? summary.nightTop
  const upcomingCalendarEventCount = useMemo(() => countCalendarEventsWithinDays(calendarEvents, 7), [calendarEvents])
  const visibleMatches = filteredExactMatches.slice(0, 16)
  const currentPlan = subscription.plan
  const currentLimits = planLimits[currentPlan]
  const activeWatchedHits = watchSearchTerm.trim() ? searchedWatchedWordHits : watchedWordHits
  const visibleWatchedHits = dedupeWatchedHitsByStore(activeWatchedHits).slice(0, 8)
  const latestPost = posts[0]
  const hotStore = useMemo(
    () => selectSpotlightStore(storeRadar, genderRankingByStoreId, bbsSourceByStoreId, todayEventCountByStoreId, initialState.setupStatus.generatedAt),
    [bbsSourceByStoreId, genderRankingByStoreId, initialState.setupStatus.generatedAt, storeRadar, todayEventCountByStoreId],
  )
  const watchStore = useMemo(
    () => selectComparisonStore(storeRadar, hotStore, genderRankingByStoreId, bbsSourceByStoreId, todayEventCountByStoreId, initialState.setupStatus.generatedAt),
    [bbsSourceByStoreId, genderRankingByStoreId, hotStore, initialState.setupStatus.generatedAt, storeRadar, todayEventCountByStoreId],
  )
  const sourceHealth = useMemo(() => buildSourceHealth(bbsSources), [bbsSources])
  const skipStore = useMemo(
    () => selectSkipStore(storeRadar, hotStore, watchStore, genderRankingByStoreId, bbsSourceByStoreId, todayEventCountByStoreId),
    [bbsSourceByStoreId, genderRankingByStoreId, hotStore, storeRadar, todayEventCountByStoreId, watchStore],
  )
  const todayTopStores = useMemo(
    () =>
      storeRadar
        .filter((point) => storeDecisions[point.store.id] !== 'hidden')
        .toSorted((a, b) => {
          const bRanking = genderRankingByStoreId.get(b.store.id)
          const aRanking = genderRankingByStoreId.get(a.store.id)
          const bFemalePosts = bRanking?.femaleSignals ?? 0
          const aFemalePosts = aRanking?.femaleSignals ?? 0
          const bEventCount = todayEventCountByStoreId.get(b.store.id) ?? 0
          const aEventCount = todayEventCountByStoreId.get(a.store.id) ?? 0

          return bFemalePosts - aFemalePosts || b.score - a.score || bEventCount - aEventCount || b.share - a.share
        })
        .slice(0, 3),
    [genderRankingByStoreId, storeDecisions, storeRadar, todayEventCountByStoreId],
  )
  const latestCaptureLabel = bbsSnapshots[0]?.capturedAt ? formatRadarCapturedAt(bbsSnapshots[0].capturedAt) : '取得待ち'
  const activeWords = wordCategories.filter((word) =>
    posts.some((post) => word.examples.some((example) => post.body.includes(example))),
  )
  const visibleWords = activeWords.length ? activeWords : wordCategories.slice(0, 5)
  const radarScore = featuredEvent?.score ?? 0
  const modeLabel = mode === 'database' ? '保存済み' : mode === 'anonymous' ? 'ログイン待ち' : 'デモ'
  const busyLabel = busy ? '処理中…' : apiState.message === modeLabel ? '待機中' : apiState.message
  const selectedStorePoint = selectedStoreId ? storeRadar.find((point) => point.store.id === selectedStoreId) : undefined
  const selectedStoreSource = selectedStorePoint ? bbsSourceByStoreId.get(selectedStorePoint.store.id) : undefined
  const selectedStoreAnalytics = selectedStorePoint ? storeAnalyticsById.get(selectedStorePoint.store.id) : undefined
  const selectedStoreEventCount = selectedStorePoint ? eventCountByStoreId.get(selectedStorePoint.store.id) ?? 0 : 0
  const selectedStoreGenderRanking = selectedStorePoint ? genderRankingByStoreId.get(selectedStorePoint.store.id) : undefined
  const candidateStoreCount = Object.values(storeDecisions).filter((state) => state === 'candidate').length
  const favoriteStoreCount = Object.values(storeDecisions).filter((state) => state === 'favorite').length
  const hiddenStoreCount = Object.values(storeDecisions).filter((state) => state === 'hidden').length
  const activeNavItem = navItems.find((item) => item.key === activeNav) ?? navItems[0]
  useBodyScrollLock(Boolean(selectedStorePoint))

  useEffect(() => {
    if (selectedStorePoint || bodyScrollLockState.count > 0) return
    if (document.body.style.overflow !== 'hidden') return
    document.body.style.overflow = ''
    document.body.style.paddingRight = ''
  }, [selectedStorePoint])

  function navigateTo(item: (typeof navItems)[number]) {
    setActiveNav(item.key)
    setView(item.view)
    const targetId = item.targetId
    if (targetId) {
      window.setTimeout(() => {
        document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 0)
    }
  }

  function navigateByKey(target: NavKey) {
    const item = navItems.find((navItem) => navItem.key === target) ?? navItems[0]
    navigateTo(item)
  }

  function dismissInstallReminder() {
    window.localStorage.setItem(installReminderStorageKey, String(Date.now()))
    setShowInstallReminder(false)
    setShowInstallGuide(false)
  }

  async function startInstallFlow() {
    if (!installPrompt) {
      setShowInstallGuide(true)
      return
    }

    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    if (choice.outcome === 'accepted') {
      window.localStorage.setItem(installReminderStorageKey, String(Date.now()))
      setShowInstallReminder(false)
      setShowInstallGuide(false)
      setInstallPrompt(null)
      return
    }

    dismissInstallReminder()
  }

  function closeFirstGuide() {
    window.localStorage.setItem(firstGuideStorageKey, 'seen')
    setShowFirstGuide(false)
  }

  function runFirstGuideAction(target: NavKey) {
    closeFirstGuide()
    navigateByKey(target)
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

  function toggleWatchedTemplate(key: WatchedTemplateKey) {
    setEnabledWatchedTemplates((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    )
  }

  function updateStoreDecision(storeId: string, state: StoreDecisionState) {
    const nextDecision: StoreDecisionState = storeDecisions[storeId] === state ? 'watch' : state
    setStoreDecisions((current) => {
      if (current[storeId] === state) {
        const next = { ...current }
        delete next[storeId]
        return next
      }
      return { ...current, [storeId]: state }
    })

    if (!isSignedIn) return
    void postJson<{ mode?: RuntimeMode; message?: string }>('/api/store-decisions', {
      storeId,
      decision: nextDecision,
    })
      .then((result) => {
        applyMode(result.mode, result.message)
        if (!result.message) flash(nextDecision === 'watch' ? '候補状態を戻しました。' : '候補状態を保存しました。')
      })
      .catch((error) => {
        flash(error instanceof Error ? error.message : '候補状態は端末内に保存しました。', 'warn')
      })
  }

  function resetStoreExplorer() {
    setStoreQuery('')
    setStoreSort('hot')
    setStoreSessionFilter('all')
    setStoreSignalFilter('all')
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
      const normalizedPattern = normalizeLocalSearchText(result.bookmark.pattern)
      setWordBookmarks((current) => [
        result.bookmark,
        ...current.filter(
          (bookmark) =>
            bookmark.id !== result.bookmark.id &&
            (bookmark.matchType !== result.bookmark.matchType || normalizeLocalSearchText(bookmark.pattern) !== normalizedPattern),
        ),
      ])
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
    const removedBookmark = wordBookmarks.find((bookmark) => bookmark.id === id)
    const removedActiveSearch =
      removedBookmark && normalizeLocalSearchText(removedBookmark.pattern) === normalizeLocalSearchText(watchSearchTerm)

    if (id.startsWith('local-')) {
      setWordBookmarks((current) => current.filter((bookmark) => bookmark.id !== id))
      if (removedActiveSearch) clearWatchedWordSearch()
      flash('一時保存ワードを削除しました。')
      return
    }

    setBusy('delete-word-bookmark')
    try {
      const result = await deleteJson<{ mode?: RuntimeMode; message?: string }>('/api/word-bookmarks', { id })
      setWordBookmarks((current) => current.filter((bookmark) => bookmark.id !== id))
      if (removedActiveSearch) clearWatchedWordSearch()
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
      <section aria-busy={busy ? 'true' : undefined} className="mobile-app-shell">
        <RadarBackdrop />
        <header className="app-topbar">
          <button
            className="brand-chip"
            type="button"
            onClick={() => {
              setActiveNav('today')
              setView('analytics')
            }}
            aria-label="今日の画面へ戻る"
          >
            <Crosshair size={18} weight="bold" />
            <span>ナイトレーダー</span>
          </button>
          <div className="status-cluster">
            <StatusPill icon={<ShieldCheck size={16} weight="bold" />} label={modeLabel} tone={mode === 'database' ? 'good' : 'warn'} />
            <StatusPill icon={<Lightning size={16} weight="bold" />} label={busyLabel} tone={busy ? 'warn' : apiState.tone} />
          </div>
        </header>

        <nav className="bottom-nav" aria-label="主要ナビゲーション">
          {navItems.map((item) => {
            const isActive = activeNav === item.key

            return (
              <button
                aria-pressed={isActive}
                className={isActive ? 'is-active' : ''}
                key={item.key}
                type="button"
                onClick={() => navigateTo(item)}
              >
                <span className="nav-icon-shell">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
              </button>
            )
          })}
        </nav>

        <ScreenContext item={activeNavItem} />

        {showInstallReminder ? (
          <InstallReminderCard
            canInstall={Boolean(installPrompt)}
            showGuide={showInstallGuide}
            onDismiss={dismissInstallReminder}
            onInstall={startInstallFlow}
          />
        ) : null}

        {showFirstGuide ? (
          <FirstRunGuide
            onClose={closeFirstGuide}
            onOpenSearch={() => runFirstGuideAction('search')}
            onOpenStores={() => runFirstGuideAction('stores')}
            onOpenToday={() => runFirstGuideAction('today')}
          />
        ) : null}

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
              <ActionButton
                icon={<Broadcast size={20} weight="bold" />}
                label="今日"
                onClick={() => {
                  setActiveNav('today')
                  setView('analytics')
                }}
              />
              <ActionButton
                icon={<Storefront size={20} weight="bold" />}
                label="探す"
                onClick={() => {
                  setActiveNav('stores')
                  setView('capture')
                }}
              />
              <ActionButton
                icon={<MagnifyingGlass size={20} weight="bold" />}
                label="名前"
                onClick={() => {
                  setActiveNav('search')
                  setView('automate')
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
                {todayOrderedScoredEvents.slice(0, 5).map((event) => (
                  <ScoreRow event={event} key={event.id} />
                ))}
              </div>
            </section>

            <LatestPost source={formatPostSource(latestPost?.source ?? 'manual')} body={latestPost?.body ?? 'まだ投稿がありません。'} />
          </section>
        )}

        {view === 'analytics' && (
          <section className={`view-stack${activeNav === 'calendar' ? ' is-calendar-view' : ''}`}>
            {activeNav === 'calendar' ? (
              <>
                <ViewIntro
                  eyebrow="予定"
                  title="朝イベ・夜イベ・注目日を分けて見る"
                  body="月1、ビンゴ、スタッフ誕生日など、盛り上がりやすい予定だけを切り替えて確認できます。"
                />
                <MonthlyCalendarPreview events={calendarEvents} focusMode stores={stores} />
              </>
            ) : (
              <>
                <TodayDecisionCard
                  eventCountByStoreId={todayEventCountByStoreId}
                  genderRankingByStoreId={genderRankingByStoreId}
                  hotStore={hotStore}
                  latestCaptureLabel={latestCaptureLabel}
                  onOpenCalendar={() => {
                    setActiveNav('calendar')
                    setView('analytics')
                  }}
                  onOpenForecast={() => {
                    setActiveNav('stores')
                    setView('capture')
                  }}
                  onRunScoring={runScoring}
                  skipStore={skipStore}
                  sourceByStoreId={bbsSourceByStoreId}
                  sourceHealth={sourceHealth}
                  topStores={todayTopStores}
                  watchStore={watchStore}
                  busy={busy}
                />
                <AppDecisionFlow
                  eventCount={upcomingCalendarEventCount}
                  eventScopeLabel="直近7日"
                  savedCount={candidateStoreCount + favoriteStoreCount}
                  watchedCount={wordBookmarks.length + enabledWatchedTemplates.length}
                  onOpenCalendar={() => {
                    setActiveNav('calendar')
                    setView('analytics')
                  }}
                  onOpenStores={() => {
                    setActiveNav('stores')
                    setView('capture')
                  }}
                  onOpenWatch={() => {
                    setActiveNav('search')
                    setView('automate')
                  }}
                />
              </>
            )}
          </section>
        )}

        {view === 'capture' && (
          <section className="view-stack">
            <ViewIntro eyebrow="探す" title="条件を絞って候補を決める" body="今日の営業分の女性書き込み順を起点に、行く余地がある店舗だけを残します。" />

            <StoreDiscoveryPanel
              allPoints={storeRadar}
              analyticsByStoreId={storeAnalyticsById}
              candidateCount={candidateStoreCount}
              eventCountByStoreId={eventCountByStoreId}
              favoriteCount={favoriteStoreCount}
              genderRankingByStoreId={genderRankingByStoreId}
              hiddenCount={hiddenStoreCount}
              points={filteredStoreRadar}
              query={storeQuery}
              sourceByStoreId={bbsSourceByStoreId}
              sort={storeSort}
              sessionFilter={storeSessionFilter}
              signalFilter={storeSignalFilter}
              totalCount={storeRadar.length}
              storeDecisions={storeDecisions}
              onDecisionChange={updateStoreDecision}
              onOpenDetail={setSelectedStoreId}
              onQueryChange={setStoreQuery}
              onReset={resetStoreExplorer}
              onSessionFilterChange={setStoreSessionFilter}
              onSignalFilterChange={setStoreSignalFilter}
              onSortChange={setStoreSort}
            />

            <StoreGenderRadar points={filteredStoreRadar} rankings={genderPostRankings} />
            {selectedStorePoint ? (
              <StoreDetailDrawer
                analytics={selectedStoreAnalytics}
                decision={storeDecisions[selectedStorePoint.store.id]}
                eventCount={selectedStoreEventCount}
                genderRanking={selectedStoreGenderRanking}
                point={selectedStorePoint}
                source={selectedStoreSource}
                onClose={() => setSelectedStoreId(null)}
                onDecisionChange={updateStoreDecision}
              />
            ) : null}
          </section>
        )}

        {view === 'automate' && (
          <section className="view-stack">
            <ViewIntro eyebrow="監視" title="気になる名前だけ確認する" body="TOPや探すで候補を決めた後、直近24時間の投稿者名に出ているかだけを見ます。" />

            <WatchedWordsPanel
              hits={visibleWatchedHits}
              bookmarks={wordBookmarks}
              bookmarkDraft={bookmarkDraft}
              searchTerm={watchSearchTerm}
              selectedStoreId={watchStoreId}
              stores={stores}
              enabledTemplateKeys={enabledWatchedTemplates}
              busy={busy}
              onDraftChange={setBookmarkDraft}
              onAddBookmark={addWordBookmark}
              onDeleteBookmark={deleteWordBookmark}
              onSearch={runWatchedWordSearch}
              onClearSearch={clearWatchedWordSearch}
              onStoreChange={setWatchStoreId}
              onToggleTemplate={toggleWatchedTemplate}
              onEnableAllTemplates={() => setEnabledWatchedTemplates([...defaultWatchedTemplateKeys])}
              onDisableAllTemplates={() => setEnabledWatchedTemplates([])}
              onUseBookmark={(bookmark) => {
                setBookmarkDraft(bookmark.pattern)
                setWatchSearchTerm(bookmark.pattern)
              }}
            />

            <ExactSearchCard
              activeFilter={exactMatchFilter}
              busy={busy}
              counts={exactMatchCounts}
              exactTerms={exactTerms}
              isSignedIn={isSignedIn}
              matches={visibleMatches}
              total={activeExactMatches.length}
              onFilterChange={setExactMatchFilter}
              onSave={saveExactTerms}
              onUpdateTerm={updateExactTerm}
            />
          </section>
        )}

        {view === 'account' && (
          <section className="view-stack">
            <ViewIntro eyebrow="設定" title="アカウント" body="ログイン状態と登録済み店舗を確認します。" />

            <section className="app-card form-card">
              <FormTitle icon={<ShieldCheck size={19} weight="bold" />} title="認証" />
              <div className="account-state">
                <span>{signedInLabel ? signedInLabel : '未ログイン'}</span>
                <strong>{isSignedIn ? 'ログイン中' : 'ログイン待ち'}</strong>
              </div>
              {isSignedIn ? (
                <div className="signed-in-panel">
                  <p>ログイン済みのため、追加のログインボタンは停止しています。別アカウントで入り直す場合はログアウトしてください。</p>
                </div>
              ) : (
                <a className="secondary-action" href="/login?next=/app">
                  ログインページへ
                </a>
              )}
              {isSignedIn && (
                <button className="secondary-action" type="button" onClick={signOut} disabled={busy === 'signout'}>
                  ログアウト
                </button>
              )}
            </section>

            <RegisteredStoreMenu stores={stores} />

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

        {busy ? <BusyOverlay label={loadingLabelForBusy(busy)} /> : null}
      </section>
    </main>
  )
}

function loadingLabelForBusy(value: string) {
  const labels: Record<string, string> = {
    score: 'スコアを再計算しています',
    'word-bookmark': '注目ワードを保存しています',
    'delete-word-bookmark': '注目ワードを削除しています',
    exact: '検索条件を保存しています',
    signout: 'ログアウトしています',
  }

  return labels[value] ?? '処理しています'
}

function BusyOverlay({ label }: { label: string }) {
  useEffect(() => {
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [])

  return (
    <div
      aria-live="polite"
      className="busy-overlay"
      role="status"
    >
      <div className="busy-loader" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <p>{label}</p>
      <small>完了するまでこの画面でお待ちください</small>
    </div>
  )
}

function RegisteredStoreMenu({ stores }: { stores: StoreProfile[] }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <section className="app-card settings-menu-card">
      <button
        aria-controls="registered-store-list"
        aria-expanded={isOpen}
        className="settings-menu-trigger"
        type="button"
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className="settings-menu-icon" aria-hidden="true">
          <List size={18} weight="bold" />
        </span>
        <span>
          <small>店舗マスタ</small>
          <strong>登録済み店舗</strong>
        </span>
        <em>{stores.length}件</em>
        <CaretDown aria-hidden="true" className="settings-menu-caret" data-open={isOpen} size={17} weight="bold" />
      </button>

      {isOpen ? (
        <div className="catalog-list settings-store-list" id="registered-store-list">
          {stores.length ? (
            stores.map((store) => (
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
            <p className="muted-note">店舗マスタを投入すると表示されます。</p>
          )}
        </div>
      ) : null}
    </section>
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
  return (
    <div className="radar-backdrop" aria-hidden="true">
      <div className="backdrop-aurora" />
      <div className="backdrop-sweep" />
      <svg className="backdrop-circuit" viewBox="0 0 640 920" preserveAspectRatio="none">
        <path
          className="path-a"
          d="M40 142 C160 104 220 188 318 151 C438 105 498 146 606 90"
        />
        <path
          className="path-b"
          d="M24 672 C146 590 222 710 330 620 C438 528 514 614 626 548"
        />
      </svg>
      <div className="backdrop-grid" />
      {backdropNodes.map((node) => (
        <span
          className="backdrop-node"
          key={`${node.x}-${node.y}`}
          style={
            {
              '--node-delay': `${node.delay}s`,
              '--node-size': `${node.size}px`,
              '--node-x': node.x,
              '--node-y': node.y,
            } as CSSProperties
          }
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

function ScreenContext({ item }: { item: (typeof navItems)[number] }) {
  const copy = navScreenCopy[item.key]

  return (
    <section className="screen-context" aria-label="現在の画面">
      <span>{item.label}</span>
      <div>
        <strong>{copy.title}</strong>
        <p>{copy.body}</p>
      </div>
    </section>
  )
}

function FirstRunGuide({
  onClose,
  onOpenSearch,
  onOpenStores,
  onOpenToday,
}: {
  onClose: () => void
  onOpenSearch: () => void
  onOpenStores: () => void
  onOpenToday: () => void
}) {
  return (
    <section className="first-run-guide" aria-label="初回案内">
      <div>
        <span>最初に見る場所</span>
        <strong>まずは3つだけ確認してください。</strong>
        <p>迷ったら今日の結論、条件で絞るなら探す、気になる名前がある時だけ名前確認を使います。</p>
      </div>
      <div className="first-run-actions">
        <button type="button" onClick={onOpenToday}>
          今日の候補を見る
        </button>
        <button type="button" onClick={onOpenSearch}>
          名前を確認
        </button>
        <button type="button" onClick={onOpenStores}>
          候補を探す
        </button>
      </div>
      <button className="first-run-close" type="button" onClick={onClose}>
        閉じる
      </button>
    </section>
  )
}

function InstallReminderCard({
  canInstall,
  showGuide,
  onDismiss,
  onInstall,
}: {
  canInstall: boolean
  showGuide: boolean
  onDismiss: () => void
  onInstall: () => void
}) {
  return (
    <section className="install-reminder-card" aria-label="スマホへの追加案内">
      <div>
        <span>スマホに追加</span>
        <strong>Chromeのホーム画面からすぐ開けます。</strong>
        <p>
          {canInstall
            ? '通知ではなく、アプリのようにワンタップで開くための導線です。'
            : 'Chromeのメニューから「ホーム画面に追加」を選ぶと、アプリのように起動できます。'}
        </p>
        {showGuide ? <em>Chrome右上メニュー → ホーム画面に追加 → 追加 の順に進めてください。</em> : null}
      </div>
      <div className="install-reminder-actions">
        <button type="button" onClick={onInstall}>
          {canInstall ? 'スマホに追加' : '追加方法を見る'}
        </button>
        <button className="secondary-action" type="button" onClick={onDismiss}>
          あとで
        </button>
      </div>
    </section>
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
  skipStore,
  latestCaptureLabel,
  sourceHealth,
  sourceByStoreId,
  genderRankingByStoreId,
  eventCountByStoreId,
  topStores,
  busy,
  onRunScoring,
  onOpenCalendar,
  onOpenForecast,
}: {
  hotStore?: StoreRadarPoint
  watchStore?: StoreRadarPoint
  skipStore?: StoreRadarPoint
  latestCaptureLabel: string
  sourceHealth: SourceHealth
  sourceByStoreId: Map<string, BbsSource>
  genderRankingByStoreId: Map<string, GenderPostRanking>
  eventCountByStoreId: Map<string, number>
  topStores: StoreRadarPoint[]
  busy: string
  onRunScoring: () => void
  onOpenCalendar: () => void
  onOpenForecast: () => void
}) {
  const fallbackStores = [hotStore, watchStore, skipStore].filter((point): point is StoreRadarPoint => Boolean(point))
  const rankedStores = (topStores.length ? topStores : fallbackStores)
    .filter((point, index, array) => array.findIndex((candidate) => candidate.store.id === point.store.id) === index)
    .slice(0, 3)
  const rankLabels = ['ヤバすぎて滅店', '爆アゲ店', '激アツ店']
  const cards: Array<{
    kind: DecisionStoreKind
    label: string
    title: string
    point?: StoreRadarPoint
    reason: string
  }> = rankedStores.map((point, index) => {
    const ranking = genderRankingByStoreId.get(point.store.id)
    const source = sourceByStoreId.get(point.store.id)
    const eventCount = eventCountByStoreId.get(point.store.id) ?? 0

    return {
      kind: (index === 0 ? 'go' : 'maybe') as DecisionStoreKind,
      label: `${index + 1}位`,
      title: rankLabels[index] ?? '候補',
      point,
      reason: buildStoreDecisionReason(point, ranking, source, eventCount, 'BBS反応を取得中です。'),
    }
  })

  return (
    <section className="today-decision-card" aria-label="今日の結論">
      <div className="decision-kicker">
        <span>今日の上位3店</span>
        <em>{latestCaptureLabel}</em>
      </div>

      <div className="decision-store-grid">
        {cards.map((card) => (
          <DecisionStoreCard
            eventCount={card.point ? eventCountByStoreId.get(card.point.store.id) ?? 0 : 0}
            key={`${card.label}-${card.point?.store.id ?? 'pending'}`}
            kind={card.kind}
            label={card.label}
            point={card.point}
            ranking={card.point ? genderRankingByStoreId.get(card.point.store.id) : undefined}
            reason={card.reason}
            source={card.point ? sourceByStoreId.get(card.point.store.id) : undefined}
            title={card.title}
          />
        ))}
      </div>

      <div className="decision-definition-strip" aria-label="数値の定義">
        <strong>判断は5指標だけ</strong>
        <span>女性書き込み</span>
        <span>直近更新</span>
        <span>イベント有無</span>
        <span>営業時間</span>
        <span>料金帯</span>
      </div>

      <div className="data-reliability-strip" aria-label="データ信頼性">
        <span>データ信頼性</span>
        <strong>{formatSourceSummary(sourceHealth, latestCaptureLabel)}</strong>
        <em>成功 {sourceHealth.ok} / 古い {sourceHealth.stale} / 不可 {sourceHealth.blocked + sourceHealth.failed}</em>
      </div>

      <div className="decision-actions">
        <button type="button" onClick={onRunScoring} disabled={busy === 'score'}>
          <ChartLineUp size={17} weight="bold" />
          再計算
        </button>
        <button type="button" onClick={onOpenForecast}>
          候補を探す
        </button>
        <button type="button" onClick={onOpenCalendar}>
          予定を見る
        </button>
      </div>
    </section>
  )
}

function AppDecisionFlow({
  eventCount,
  eventScopeLabel,
  savedCount,
  watchedCount,
  onOpenCalendar,
  onOpenStores,
  onOpenWatch,
}: {
  eventCount: number
  eventScopeLabel: string
  savedCount: number
  watchedCount: number
  onOpenCalendar: () => void
  onOpenStores: () => void
  onOpenWatch: () => void
}) {
  return (
    <section className="app-decision-flow" aria-label="次に見る場所">
      <div className="app-decision-flow-head">
        <span>次の一手</span>
        <h2>候補を広げず、行く理由だけを確認</h2>
        <p>ランキングを眺め続けるのではなく、候補を削ってから予定と名前だけ確認します。</p>
      </div>
      <div className="app-flow-steps">
        <button type="button" onClick={onOpenStores}>
          <span>1</span>
          <strong>候補を残す</strong>
          <small>女性反応・営業中・料金で3店以内にする</small>
          <em>{savedCount}件保存</em>
        </button>
        <button type="button" onClick={onOpenCalendar}>
          <span>2</span>
          <strong>今日の予定を見る</strong>
          <small>朝イベ・夜イベ・BINGO・誕生日だけ拾う</small>
          <em>{eventScopeLabel} {eventCount}件</em>
        </button>
        <button type="button" onClick={onOpenWatch}>
          <span>3</span>
          <strong>名前を確認</strong>
          <small>直近24時間の投稿者名だけを見る</small>
          <em>{watchedCount}語</em>
        </button>
      </div>
    </section>
  )
}

function countCalendarEventsWithinDays(events: EventInput[], days: number) {
  const startKey = dateKeyInJapan()
  const endKey = dateKeyInJapan(relativeDateInJapan(days - 1))

  return events.filter((event) => {
    const dateLabel = event.date.trim()
    if (dateLabel === '今日' || dateLabel === '明日') return true
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateLabel)) return false
    return dateLabel >= startKey && dateLabel <= endKey
  }).length
}

function eventMatchesToday(event: EventInput) {
  const todayKey = dateKeyInJapan()
  const dateLabel = event.date.trim()
  if (dateLabel === '今日') return true
  if (dateLabel === '明日') return false
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateLabel)) return dateLabel === todayKey

  const [year, month, day] = todayKey.split('-').map(Number)
  const todayWeekday = weekdayLabelForJapanDate(year, month, day)
  return eventWeekday(event) === todayWeekday
}

function buildEventCountByStore(events: EventInput[], predicate?: (event: EventInput) => boolean) {
  const map = new Map<string, number>()
  events.forEach((event) => {
    if (predicate && !predicate(event)) return
    map.set(event.storeId, (map.get(event.storeId) ?? 0) + 1)
  })
  return map
}

function DecisionStoreCard({
  eventCount,
  kind,
  label,
  point,
  ranking,
  reason,
  source,
  title,
}: {
  eventCount: number
  kind: DecisionStoreKind
  label: string
  point?: StoreRadarPoint
  ranking?: GenderPostRanking
  reason: string
  source?: BbsSource
  title: string
}) {
  const score = point?.score ?? 0
  const attentionCount = getDisplayAttentionCount(point, ranking)
  const signalCounts = getDisplaySignalCounts(point, ranking)
  const femaleRatio = ranking?.signalTotal
    ? `${ranking.femaleRatio}%`
    : attentionCount
      ? `${Math.round((signalCounts.female / Math.max(1, attentionCount)) * 100)}%`
      : '未判定'
  const firstRatio = attentionCount ? `${Math.round((signalCounts.first / Math.max(1, attentionCount)) * 100)}%` : '未判定'
  const groupRatio = attentionCount ? `${Math.round((signalCounts.group / Math.max(1, attentionCount)) * 100)}%` : '未判定'
  const comebackRatio = attentionCount ? `${Math.round((signalCounts.comeback / Math.max(1, attentionCount)) * 100)}%` : '未判定'
  const officialUrl = point ? resolveStorePrimaryUrl(point.store, source) : undefined
  const mapUrl = point ? resolveStoreMapUrl(point.store) : undefined
  const noticeLabel = eventCount ? `予定 ${eventCount}件` : '根拠'
  const sourceLabel = sourceReliabilityLabel(source)
  const eventStrength = Math.max(0, Math.min(100, eventCount * 34))
  const attentionStrength = Math.max(0, Math.min(100, Math.round((attentionCount / 120) * 100)))
  const signalMeters = [
    { label: '女性反応', value: femaleRatio, percent: percentNumber(femaleRatio), tone: 'signal' },
    { label: '投稿量', value: `${attentionCount}件`, percent: attentionStrength, tone: 'blue' },
    { label: '予定', value: eventCount ? `${eventCount}件` : 'なし', percent: eventStrength, tone: 'amber' },
    { label: '取得', value: sourceLabel, percent: sourceReliabilityPercent(source), tone: 'quiet' },
  ]

  return (
    <article className={`decision-store-card is-${kind}`}>
      <div className="decision-store-head">
        <span>{label}</span>
        <em>{title}</em>
      </div>
      <div className="decision-store-main">
        <div>
          <strong>{point ? formatBarName(point.store.name) : '観測待ち'}</strong>
          <p>{point ? `${formatStoreArea(point.store.area)} / ${formatStoreBusinessHours(point.store)}` : reason}</p>
        </div>
        <div className="decision-score-panel">
          <div className="decision-score" aria-label={`盛り上がり ${score}点`} style={{ '--score-progress': `${Math.max(0, Math.min(100, score))}%` } as CSSProperties}>
            <div className="decision-score-inner">
              <span>{score || '--'}</span>
              <small>点</small>
            </div>
          </div>
          <dl className="decision-score-meters" aria-label="判断材料">
            {signalMeters.map((meter) => (
              <div
                className={`is-${meter.tone}`}
                key={meter.label}
                style={{ '--meter-progress': `${meter.percent}%` } as CSSProperties}
              >
                <dt>{meter.label}</dt>
                <dd>{meter.value}</dd>
                <i aria-hidden="true" />
              </div>
            ))}
          </dl>
        </div>
      </div>
      {point ? (
        <>
          <dl className="decision-store-profile">
            <div>
              <dt>エリア</dt>
              <dd>{formatStoreArea(point.store.area)}</dd>
            </div>
            <div>
              <dt>最寄り</dt>
              <dd>{point.store.nearestStation?.trim() || point.store.address?.trim() || '公式確認'}</dd>
            </div>
            <div>
              <dt>営業</dt>
              <dd>{formatStoreBusinessHours(point.store)}</dd>
            </div>
            <div>
              <dt>料金</dt>
              <dd>{point.store.priceNote?.trim() || '公式確認'}</dd>
            </div>
          </dl>
          <dl className="decision-signal-grid" aria-label="観測値">
            <div className="is-main">
              <dt>営業分投稿</dt>
              <dd>{attentionCount}<small>件</small></dd>
            </div>
            <div>
              <dt>女性率</dt>
              <dd>{femaleRatio}</dd>
            </div>
            <div>
              <dt>初回率</dt>
              <dd>{firstRatio}</dd>
            </div>
            <div>
              <dt>複数率</dt>
              <dd>{groupRatio}</dd>
            </div>
            <div>
              <dt>久しぶり</dt>
              <dd>{comebackRatio}</dd>
            </div>
          </dl>
          <p className="decision-store-notice"><span>{noticeLabel}</span>{reason}</p>
          <div className="decision-store-links">
            {officialUrl ? <a href={officialUrl} target="_blank" rel="noreferrer">公式</a> : <span>公式未登録</span>}
            {source?.url ? <a href={source.url} target="_blank" rel="noreferrer">BBS</a> : <span>BBS未登録</span>}
            {mapUrl ? <a href={mapUrl} target="_blank" rel="noreferrer">地図</a> : <span>地図未登録</span>}
          </div>
        </>
      ) : (
        <p className="muted-note">BBS巡回後に候補を表示します。</p>
      )}
    </article>
  )
}

function DecisionMetricList({ metrics }: { metrics: DecisionMetric[] }) {
  return (
    <dl className="decision-metric-list">
      {metrics.map((metric) => (
        <div className={metric.tone ? `is-${metric.tone}` : undefined} key={metric.label}>
          <dt>{metric.label}</dt>
          <dd>{metric.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function formatRadarCapturedAt(value?: string) {
  if (!value) return '巡回待ち'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '巡回待ち'
  return date.toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatSourceSummary(health: SourceHealth, latestCaptureLabel: string) {
  const healthText = sourceHealthLabel(health)
  if (healthText === '取得待ち' || latestCaptureLabel === '取得待ち' || latestCaptureLabel === '巡回待ち') return healthText
  return `最終更新 ${latestCaptureLabel} / ${healthText}`
}

function clampSignalCount(value: number, ceiling: number) {
  if (!value) return 0
  if (ceiling <= 0) return 0
  return Math.min(value, ceiling)
}

function compactStoreLabel(name: string) {
  return formatBarName(name)
    .replace(/^bar\s+/i, '')
    .replace(/^BAR\s+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 11)
}

function getDisplayAttentionCount(point?: StoreRadarPoint, ranking?: GenderPostRanking) {
  if (!point) return 0
  if (ranking) return ranking.observedCount
  if (point.postCount) return point.postCount
  return 0
}

function getDisplaySignalCounts(point?: StoreRadarPoint, ranking?: GenderPostRanking) {
  if (!point) {
    return {
      female: 0,
      male: 0,
      first: 0,
      group: 0,
      emoji: 0,
      comeback: 0,
    }
  }

  const attentionCount = getDisplayAttentionCount(point, ranking)
  const female = ranking ? ranking.femaleSignals : point.signals.femaleOnly
  const male = ranking ? ranking.maleSignals : 0

  return {
    female: clampSignalCount(female, attentionCount),
    male: clampSignalCount(male, attentionCount),
    first: clampSignalCount(point.signals.firstVisit, attentionCount),
    group: clampSignalCount(point.signals.groupVisit, attentionCount),
    emoji: clampSignalCount(point.signals.emoji, attentionCount),
    comeback: clampSignalCount(point.signals.comeback, attentionCount),
  }
}

function currentSessionInJapan(): Exclude<StoreSessionFilter, 'all' | 'current'> {
  const hourPart = new Intl.DateTimeFormat('ja-JP', {
    hour: 'numeric',
    hour12: false,
    timeZone: 'Asia/Tokyo',
  })
    .formatToParts(new Date())
    .find((part) => part.type === 'hour')?.value
  const hour = Number(hourPart ?? 0)
  return hour >= 10 && hour < 18 ? 'day' : 'night'
}

function isStoreAvailableForSession(store: StoreProfile, filter: StoreSessionFilter) {
  if (filter === 'all') return true
  const session = filter === 'current' ? currentSessionInJapan() : filter
  return session === 'day' ? store.hasDaytime : store.hasNight
}

function isAffordableStore(store: StoreProfile) {
  const prices = [...(store.priceNote ?? '').matchAll(/\d{1,3}(?:,\d{3})+|\d{4,5}/g)]
    .map((match) => Number(match[0].replace(/,/g, '')))
    .filter((value) => Number.isFinite(value) && value > 0)
  if (!prices.length) return false
  return Math.min(...prices) <= 5000
}

function formatStoreBusinessHours(store: StoreProfile) {
  const labels = [
    store.hasDaytime ? `昼 ${store.openingHourDay || 'あり'}` : '',
    store.hasNight ? `夜 ${store.openingHourNight || 'あり'}` : '',
  ].filter(Boolean)
  return labels.length ? labels.join(' / ') : formatStoreSessionLabel(store)
}

function sourceReliabilityTone(source?: BbsSource): MetricTone {
  if (!source?.lastStatus || source.lastStatus === 'pending') return 'muted'
  if (source.lastStatus !== 'ok') return 'warn'
  return isSourceStale(source) ? 'warn' : 'good'
}

function sourceReliabilityLabel(source?: BbsSource) {
  if (!source?.lastStatus || source.lastStatus === 'pending') return '取得待ち'
  if (source.lastStatus !== 'ok') return '取得不可'
  return isSourceStale(source) ? '取得古い' : '取得成功'
}

function percentNumber(value: string) {
  const parsed = Number(value.replace('%', ''))
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : 0
}

function sourceReliabilityPercent(source?: BbsSource) {
  if (!source?.lastStatus || source.lastStatus === 'pending') return 18
  if (source.lastStatus !== 'ok') return 8
  return isSourceStale(source) ? 42 : 100
}

function buildDecisionMetrics(point: StoreRadarPoint, ranking?: GenderPostRanking, source?: BbsSource, eventCount = 0): DecisionMetric[] {
  const femalePosts = ranking?.femaleSignals ?? 0
  return [
    { label: '女性書き込み', value: `${femalePosts}件`, tone: femalePosts > 0 ? 'good' : 'muted' },
    { label: '直近更新', value: formatRadarCapturedAt(point.lastCapturedAt), tone: sourceReliabilityTone(source) },
    { label: 'イベント', value: eventCount ? `${eventCount}件` : 'なし', tone: eventCount ? 'good' : 'muted' },
    { label: '営業時間', value: formatStoreBusinessHours(point.store), tone: isStoreAvailableForSession(point.store, 'current') ? 'good' : 'muted' },
    { label: '料金帯', value: point.store.priceNote?.trim() || '公式確認', tone: isAffordableStore(point.store) ? 'good' : 'muted' },
  ]
}

function buildStoreDecisionReason(
  point?: StoreRadarPoint,
  ranking?: GenderPostRanking,
  source?: BbsSource,
  todayEventCount = 0,
  fallback = '掲示板の巡回後に判定が出ます。',
) {
  if (!point) return fallback
  const attentionCount = getDisplayAttentionCount(point, ranking)
  const femaleText = ranking?.signalTotal
    ? `女性率 ${ranking.femaleRatio}%`
    : ranking?.femaleSignals
      ? `女性書き込み ${ranking.femaleSignals}件`
      : '女性反応は蓄積中'
  const eventText = todayEventCount ? `今日の予定 ${todayEventCount}件` : '今日の予定なし'
  return `${eventText} / 営業分投稿 ${attentionCount}件 / ${femaleText} / ${sourceReliabilityLabel(source)}`
}

function storeSkipScore(point: StoreRadarPoint, ranking?: GenderPostRanking, source?: BbsSource, eventCount = 0) {
  const femalePosts = ranking?.femaleSignals ?? 0
  const sourcePenalty = source?.lastStatus === 'ok' && !isSourceStale(source) ? 0 : 18
  const eventPenalty = eventCount ? 0 : 12
  const femalePenalty = femalePosts ? 0 : 16
  const sessionPenalty = isStoreAvailableForSession(point.store, 'current') ? 0 : 10
  return 100 - point.score + sourcePenalty + eventPenalty + femalePenalty + sessionPenalty
}

function stableHash(value: string) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }
  return hash
}

function spotlightDateKey(generatedAt?: string) {
  const date = generatedAt ? new Date(generatedAt) : new Date()
  return dateKeyInJapan(Number.isNaN(date.getTime()) ? new Date() : date)
}

function storeSpotlightWeight(point: StoreRadarPoint, ranking?: GenderPostRanking, source?: BbsSource, eventCount = 0, originalIndex = 0) {
  const femalePosts = ranking?.femaleSignals ?? 0
  const updatedAt = point.lastCapturedAt ? new Date(point.lastCapturedAt).getTime() : 0
  const freshnessHours = updatedAt ? Math.max(0, (Date.now() - updatedAt) / (1000 * 60 * 60)) : 48
  const freshnessScore = Math.max(0, 18 - Math.min(18, freshnessHours))
  const sourceScore = source?.lastStatus === 'ok' && !isSourceStale(source) ? 8 : 0
  const sessionScore = isStoreAvailableForSession(point.store, 'current') ? 10 : -8
  return point.score + Math.min(femalePosts, 10) * 2.6 + Math.min(eventCount, 3) * 7 + freshnessScore + sourceScore + sessionScore - originalIndex * 1.5
}

function selectSpotlightStore(
  points: StoreRadarPoint[],
  rankings?: Map<string, GenderPostRanking>,
  sources?: Map<string, BbsSource>,
  eventCounts?: Map<string, number>,
  generatedAt?: string,
) {
  const activePoints = points.filter((point) => point.score > 0)
  if (activePoints.length <= 1) return activePoints[0] ?? points[0]

  const topScore = activePoints[0]?.score ?? 0
  const candidates = activePoints
    .filter((point, index) => {
      const ranking = rankings?.get(point.store.id)
      const eventCount = eventCounts?.get(point.store.id) ?? 0
      return index < 8 && (point.score >= topScore - 18 || (ranking?.femaleSignals ?? 0) > 0 || eventCount > 0)
    })
    .map((point, index) => ({
      point,
      weight: storeSpotlightWeight(point, rankings?.get(point.store.id), sources?.get(point.store.id), eventCounts?.get(point.store.id) ?? 0, index),
    }))
    .toSorted((a, b) => b.weight - a.weight || b.point.score - a.point.score)

  const pool = candidates.slice(0, Math.min(4, candidates.length))
  if (pool.length <= 1) return pool[0]?.point ?? activePoints[0]

  const seed = stableHash(`${spotlightDateKey(generatedAt)}:${pool.map(({ point }) => `${point.store.id}:${point.lastCapturedAt ?? ''}`).join('|')}`)
  return pool[seed % pool.length]?.point ?? pool[0].point
}

function selectComparisonStore(
  points: StoreRadarPoint[],
  primary?: StoreRadarPoint,
  rankings?: Map<string, GenderPostRanking>,
  sources?: Map<string, BbsSource>,
  eventCounts?: Map<string, number>,
  generatedAt?: string,
) {
  const candidates = primary ? points.filter((point) => point.store.id !== primary.store.id) : points
  return selectSpotlightStore(candidates, rankings, sources, eventCounts, generatedAt)
}

function selectSkipStore(
  points: StoreRadarPoint[],
  primary?: StoreRadarPoint,
  secondary?: StoreRadarPoint,
  rankings?: Map<string, GenderPostRanking>,
  sources?: Map<string, BbsSource>,
  eventCounts?: Map<string, number>,
) {
  const excludedIds = new Set([primary?.store.id, secondary?.store.id].filter(Boolean))
  return points
    .filter((point) => !excludedIds.has(point.store.id))
    .toSorted((a, b) => {
      const bScore = storeSkipScore(b, rankings?.get(b.store.id), sources?.get(b.store.id), eventCounts?.get(b.store.id) ?? 0)
      const aScore = storeSkipScore(a, rankings?.get(a.store.id), sources?.get(a.store.id), eventCounts?.get(a.store.id) ?? 0)
      return bScore - aScore
    })[0]
}

function rootUrlFromUrl(url?: string) {
  if (!url) return undefined
  try {
    const parsed = new URL(url)
    return `${parsed.protocol}//${parsed.hostname}/`
  } catch {
    return undefined
  }
}

function resolveStorePrimaryUrl(store: StoreProfile, source?: BbsSource) {
  return store.officialUrl?.trim() || rootUrlFromUrl(source?.url)
}

function resolveStoreMapUrl(store: StoreProfile) {
  if (store.mapUrl?.trim()) return store.mapUrl.trim()
  const query = [store.address, store.name, store.area].filter(Boolean).join(' ')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

function resolveStoreFaviconUrl(storeUrl?: string) {
  if (!storeUrl) return undefined
  return `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(storeUrl)}&sz=64`
}

function storeDetailValue(value?: string) {
  return value?.trim() || '未登録'
}

function StoreInlineRadar({
  point,
  ranking,
  variant = 'compact',
}: {
  point: StoreRadarPoint
  ranking?: GenderPostRanking
  variant?: 'compact' | 'featured' | 'detail'
}) {
  const hasGenderSignal = Boolean(ranking?.signalTotal)
  const femaleRatio = hasGenderSignal ? ranking?.femaleRatio ?? 0 : 0
  const maleRatio = hasGenderSignal ? ranking?.maleRatio ?? 0 : 0
  const attentionCount = getDisplayAttentionCount(point, ranking)
  const scoreHeight = Math.max(4, Math.min(100, point.score))
  const shareHeight = Math.max(4, Math.min(100, point.share))
  const femaleHeight = hasGenderSignal ? Math.max(4, Math.min(100, femaleRatio)) : 4
  const attentionHeight = Math.max(4, Math.min(100, attentionCount ? Math.round((attentionCount / 40) * 100) : 4))

  return (
    <div
      className={`store-inline-radar is-${variant}`}
      style={
        {
          '--female-ratio': `${femaleRatio}%`,
          '--score-height': `${scoreHeight}%`,
          '--share-height': `${shareHeight}%`,
          '--female-height': `${femaleHeight}%`,
          '--attention-height': `${attentionHeight}%`,
        } as CSSProperties
      }
    >
      <div className="store-inline-donut" aria-label={`女性ワード比率 ${femaleRatio}%、男性ワード比率 ${maleRatio}%`}>
        <span>{hasGenderSignal ? femaleRatio : '--'}<small>%</small></span>
      </div>
      <div className="store-inline-bars" aria-label="店舗別の縦グラフ">
        <span>
          <i className="score" />
          <em>熱量</em>
          <strong>{point.score}</strong>
        </span>
        <span>
          <i className="share" />
          <em>比率</em>
          <strong>{point.share}%</strong>
        </span>
        <span>
          <i className="female" />
          <em>女性</em>
          <strong>{hasGenderSignal ? `${femaleRatio}%` : '--'}</strong>
        </span>
        <span>
          <i className="attention" />
          <em>投稿</em>
          <strong>{attentionCount || '--'}</strong>
        </span>
      </div>
      <dl className="store-inline-report" aria-label="店舗レポート">
        <div>
          <dt>女性</dt>
          <dd>{hasGenderSignal ? `${femaleRatio}%` : '--'}</dd>
        </div>
        <div>
          <dt>男性</dt>
          <dd>{hasGenderSignal ? `${maleRatio}%` : '--'}</dd>
        </div>
        <div>
          <dt>営業分投稿</dt>
          <dd>{attentionCount || 0}</dd>
        </div>
      </dl>
    </div>
  )
}

function todayCompatibilityLabel(analytics?: StoreBbsAnalytics) {
  if (!analytics?.postCount) return '今日との相性は蓄積中'
  const [year, month, day] = dateKeyInJapan().split('-').map(Number)
  const todayWeekday = weekdayLabelForJapanDate(year, month, day)
  const todayStat = analytics.weekdayStats.find((stat) => stat.weekday === todayWeekday)
  if (!todayStat?.count) return `今日は${todayWeekday}の投稿傾向が少なめ`
  if (todayStat.ratio >= 24) return `今日は過去投稿が多い${todayWeekday}です`
  return `今日は${todayWeekday}の過去投稿 ${todayStat.count}件`
}

const femaleGenderPattern = /(女性|女の子|女子|単女|単独女性|主婦|人妻|奥様|女性予約|女性来店|女性無料|女性一人)/g
const maleGenderPattern = /(男性|男の子|男子|単男|単独男性|男性予約|男性来店|男性一人|紳士|旦那)/g
const postMarkerPattern = /(20\d{2}年\d{1,2}月\d{1,2}日|\d{4}[-/]\d{1,2}[-/]\d{1,2}|投稿者|書き込み|来店予告|No\.\d+)/g
const postNumberPattern = /(?:記事番号[:：]?\s*|No[.\s]*)(\d{3,})/gi

function estimatePostCount(record: PostRecord) {
  if (record.source !== 'scrape') return 1
  const markers = record.body.match(postMarkerPattern)?.length ?? 0
  return Math.max(1, Math.min(80, markers || Math.ceil(record.body.length / 700)))
}

function normalizedObservationKey(value: string) {
  return value.replace(/\s+/g, ' ').replace(/[0-9０-９]{1,2}[:時][0-9０-９]{0,2}/g, '00:00').trim().slice(0, 160)
}

function collectObservationKeys(record: PostRecord) {
  const keys = new Set<string>()
  for (const match of record.body.matchAll(postNumberPattern)) {
    if (match[1]) keys.add(`no:${match[1]}`)
  }
  extractWatchedAuthorEntries(record.body).forEach((entry) => {
    const key = normalizedObservationKey([entry.name, entry.gender, entry.body].filter(Boolean).join(' '))
    if (key.length >= 3) keys.add(`author:${key}`)
  })
  if (keys.size) return keys

  const fallbackKey = normalizedObservationKey(record.body)
  if (fallbackKey) keys.add(`body:${fallbackKey}`)
  return keys
}

function matchesGenderPattern(value: string, pattern: RegExp) {
  pattern.lastIndex = 0
  const matched = pattern.test(value)
  pattern.lastIndex = 0
  return matched
}

function collectGenderObservationKeys(record: PostRecord, pattern: RegExp) {
  const keys = new Set<string>()
  const entries = extractWatchedAuthorEntries(record.body)

  entries.forEach((entry, index) => {
    const target = [entry.name, entry.gender, entry.body].filter(Boolean).join(' ')
    if (!matchesGenderPattern(target, pattern)) return

    const normalizedKey = normalizedObservationKey(target)
    keys.add(normalizedKey ? `entry:${normalizedKey}` : `entry:${record.id}:${index}`)
  })

  if (keys.size) return keys

  collectObservationKeys(record).forEach((key) => {
    if (matchesGenderPattern(key, pattern)) keys.add(key)
  })

  if (keys.size) return keys
  if (matchesGenderPattern(record.body, pattern)) keys.add(`record:${record.id}`)
  return keys
}

function countUniqueGenderSignals(records: PostRecord[], pattern: RegExp) {
  const uniqueKeys = new Set<string>()

  records.forEach((record) => {
    collectGenderObservationKeys(record, pattern).forEach((key) => uniqueKeys.add(`${record.storeId}:${key}`))
  })

  return uniqueKeys.size
}

function summarizeStoreObservationVolume(records: PostRecord[]) {
  const uniqueKeys = new Set<string>()
  let rawEstimate = 0

  records.forEach((record) => {
    rawEstimate += estimatePostCount(record)
    collectObservationKeys(record).forEach((key) => uniqueKeys.add(key))
  })

  return {
    observedCount: uniqueKeys.size,
    rawEstimate,
  }
}

function buildGenderPostRankings(records: PostRecord[], stores: StoreProfile[]): GenderPostRanking[] {
  const recordsByStore = new Map<string, PostRecord[]>()
  records.forEach((record) => {
    recordsByStore.set(record.storeId, [...(recordsByStore.get(record.storeId) ?? []), record])
  })

  return stores
    .map((store) => {
      const storeRecords = recordsByStore.get(store.id) ?? []
      const observationVolume = summarizeStoreObservationVolume(storeRecords)
      const femaleSignals = countUniqueGenderSignals(storeRecords, femaleGenderPattern)
      const maleSignals = countUniqueGenderSignals(storeRecords, maleGenderPattern)
      const signalTotal = femaleSignals + maleSignals
      const femaleRatio = signalTotal ? Math.round((femaleSignals / signalTotal) * 100) : 0
      const maleRatio = signalTotal ? 100 - femaleRatio : 0
      const verdict = signalTotal
        ? femaleRatio >= 62
          ? '女性記述が多め'
          : maleRatio >= 62
            ? '男性記述が多め'
            : '男女記述が近い'
        : '判定語が少ない'

      return {
        store,
        rank: 0,
        observedCount: observationVolume.observedCount,
        rawEstimate: observationVolume.rawEstimate,
        recordCount: storeRecords.length,
        femaleSignals,
        maleSignals,
        femaleRatio,
        maleRatio,
        signalTotal,
        verdict,
      }
    })
    .toSorted((a, b) => b.femaleSignals - a.femaleSignals || b.observedCount - a.observedCount || b.signalTotal - a.signalTotal || b.femaleRatio - a.femaleRatio)
    .map((ranking, index) => ({ ...ranking, rank: index + 1 }))
}

function StoreGenderRadar({ points, rankings }: { points: StoreRadarPoint[]; rankings: GenderPostRanking[] }) {
  const rankingByStoreId = new Map(rankings.map((ranking) => [ranking.store.id, ranking]))
  const visiblePoints = points.slice(0, 8)
  const leader = visiblePoints[0]
  const offsetPattern = [
    [0, 0],
    [-10, 8],
    [10, 9],
    [-12, -8],
    [12, -9],
    [-4, 14],
    [4, -14],
    [0, 18],
  ]
  const radarItems = visiblePoints.map((point, index) => {
    const ranking = rankingByStoreId.get(point.store.id)
    const hasGenderSignal = Boolean(ranking?.signalTotal)
    const femaleRatio = hasGenderSignal ? ranking?.femaleRatio ?? 50 : 50
    const maleRatio = hasGenderSignal ? ranking?.maleRatio ?? 50 : 50
    const x = Math.max(14, Math.min(84, femaleRatio))
    const y = Math.max(12, Math.min(88, point.score))
    const signalTotal = ranking?.signalTotal ?? 0
    const tone = !hasGenderSignal ? 'neutral' : femaleRatio >= 60 ? 'female' : maleRatio >= 60 ? 'male' : 'balanced'
    const size = Math.max(13, Math.min(24, 13 + Math.round(signalTotal / 2)))
    const [offsetX = 0, offsetY = 0] = offsetPattern[index % offsetPattern.length] ?? []

    return {
      point,
      ranking,
      femaleRatio,
      maleRatio,
      signalTotal,
      tone,
      shortLabel: compactStoreLabel(point.store.name),
      style: {
        insetInlineStart: `${x}%`,
        insetBlockEnd: `${y}%`,
        '--dot-size': `${size}px`,
        '--dot-offset-x': `${offsetX}px`,
        '--dot-offset-y': `${offsetY}px`,
      } as CSSProperties,
    }
  })
  const femaleLeaningCount = radarItems.filter((item) => item.tone === 'female').length
  const maleLeaningCount = radarItems.filter((item) => item.tone === 'male').length
  const balancedCount = radarItems.filter((item) => item.tone === 'balanced').length
  const strongCandidateCount = radarItems.filter((item) => item.femaleRatio >= 55 && item.point.score >= 70).length
  const barItems = radarItems.slice(0, 8)

  return (
    <section className="gender-radar-card" aria-label="店舗別の盛り上がりと男女比率">
      <div className="gender-radar-head">
        <div>
          <span>候補マップ</span>
          <h2>右上ほど、今日の候補として強い</h2>
          <p>縦は盛り上がり、横は女性系ワード比率です。散らばりを見るための参考値で、実人数ではありません。</p>
        </div>
        <strong>{leader ? formatBarName(leader.store.name) : '観測中'}</strong>
      </div>

      <div className="gender-map-legend" aria-label="レーダーの見方">
        <span>右上: 本命候補</span>
        <span>左上: 活発だが男性寄り</span>
        <span>右下: 女性寄りだが静か</span>
      </div>

      <dl className="gender-radar-report" aria-label="観測レポート">
        <div>
          <dt>観測店舗</dt>
          <dd>{radarItems.length}<small>店</small></dd>
        </div>
        <div>
          <dt>女性寄り</dt>
          <dd>{femaleLeaningCount}<small>店</small></dd>
        </div>
        <div>
          <dt>男性寄り</dt>
          <dd>{maleLeaningCount}<small>店</small></dd>
        </div>
        <div>
          <dt>本命圏</dt>
          <dd>{strongCandidateCount}<small>店</small></dd>
        </div>
      </dl>

      <div className="gender-radar-layout">
        <div className="gender-radar-map" aria-label="盛り上がりと女性比率の分布">
          <span className="gender-axis-y">盛り上がり</span>
          <span className="gender-axis-x">女性比率</span>
          <span className="gender-quadrant top-left">男性寄り・高反応</span>
          <span className="gender-quadrant top-right">女性寄り・高反応</span>
          <span className="gender-quadrant bottom-left">男性寄り・静か</span>
          <span className="gender-quadrant bottom-right">女性寄り・静か</span>
          {radarItems.map((item, index) => (
            <span
              aria-label={`${formatBarName(item.point.store.name)}、盛り上がり${item.point.score}点、女性比率${item.femaleRatio}%、男性比率${item.maleRatio}%`}
              className={`gender-radar-dot is-${item.tone}`}
              data-store-label={formatBarName(item.point.store.name)}
              key={item.point.store.id}
              style={item.style}
              title={`${formatBarName(item.point.store.name)} / ${item.point.score}点 / 女性${item.femaleRatio}% 男性${item.maleRatio}%`}
            >
              <b>{index + 1}</b>
              <small>{item.shortLabel}</small>
            </span>
          ))}
        </div>

        <div className="gender-radar-side">
          <dl className="gender-radar-summary">
            <div>
              <dt>女性寄り</dt>
              <dd>{femaleLeaningCount}店</dd>
            </div>
            <div>
              <dt>男性寄り</dt>
              <dd>{maleLeaningCount}店</dd>
            </div>
            <div>
              <dt>近い</dt>
              <dd>{balancedCount}店</dd>
            </div>
          </dl>
          <div className="gender-radar-list">
            {radarItems.map((item, index) => (
              <article key={item.point.store.id}>
                <span>{index + 1}</span>
                <div>
                  <strong>{formatBarName(item.point.store.name)}</strong>
                  <p>
                    盛り上がり {item.point.score}点 / 女性 {item.femaleRatio}% / 投稿 {item.ranking?.observedCount ?? 0}件
                  </p>
                </div>
                <em>{item.ranking?.verdict ?? '判定語が少ない'}</em>
              </article>
            ))}
          </div>
        </div>
      </div>

      <div className="gender-radar-bars" aria-label="店舗別の円グラフと縦グラフ">
        {barItems.map((item, index) => (
          <article
            className={`gender-radar-bar-item is-${item.tone}`}
            key={item.point.store.id}
            style={
              {
                '--bar-height': `${Math.max(4, Math.min(100, item.point.score))}%`,
                '--female-ratio': `${item.femaleRatio}%`,
              } as CSSProperties
            }
          >
            <div className="gender-radar-bar-rank">{index + 1}</div>
            <div className="gender-radar-bar-visual">
              <div className="gender-radar-meterline is-score" aria-label={`${formatBarName(item.point.store.name)} 盛り上がり ${item.point.score}点`}>
                <span>盛り上がり</span>
                <i />
                <strong>{item.point.score}</strong>
              </div>
              <div className="gender-radar-meterline is-female" aria-label={`${formatBarName(item.point.store.name)} 女性比率 ${item.femaleRatio}%`}>
                <span>女性比率</span>
                <i />
                <strong>{item.femaleRatio}%</strong>
              </div>
            </div>
            <div className="gender-radar-bar-caption">
              <strong>{formatBarName(item.point.store.name)}</strong>
              <span>投稿 {item.ranking?.observedCount ?? 0}件</span>
            </div>
            <dl className="gender-radar-bar-metrics">
              <div>
                <dt>女性</dt>
                <dd>{item.femaleRatio}%</dd>
              </div>
              <div>
                <dt>点数</dt>
                <dd>{item.point.score}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  )
}

function StoreDiscoveryPanel({
  allPoints,
  analyticsByStoreId,
  candidateCount,
  eventCountByStoreId,
  favoriteCount,
  genderRankingByStoreId,
  hiddenCount,
  points,
  query,
  sourceByStoreId,
  sort,
  sessionFilter,
  signalFilter,
  storeDecisions,
  totalCount,
  onDecisionChange,
  onOpenDetail,
  onQueryChange,
  onReset,
  onSessionFilterChange,
  onSignalFilterChange,
  onSortChange,
}: {
  allPoints: StoreRadarPoint[]
  analyticsByStoreId: Map<string, StoreBbsAnalytics>
  candidateCount: number
  eventCountByStoreId: Map<string, number>
  favoriteCount: number
  genderRankingByStoreId: Map<string, GenderPostRanking>
  hiddenCount: number
  points: StoreRadarPoint[]
  query: string
  sourceByStoreId: Map<string, BbsSource>
  sort: StoreSortKey
  sessionFilter: StoreSessionFilter
  signalFilter: StoreSignalFilter
  storeDecisions: Record<string, StoreDecisionState>
  totalCount: number
  onDecisionChange: (storeId: string, state: StoreDecisionState) => void
  onOpenDetail: (storeId: string) => void
  onQueryChange: (value: string) => void
  onReset: () => void
  onSessionFilterChange: (value: StoreSessionFilter) => void
  onSignalFilterChange: (value: StoreSignalFilter) => void
  onSortChange: (value: StoreSortKey) => void
}) {
  const visibleTop = points.slice(0, 9)
  const strongest = selectSpotlightStore(points, genderRankingByStoreId, sourceByStoreId, eventCountByStoreId)
  const candidatePoints = allPoints.filter((point) => storeDecisions[point.store.id] === 'candidate').slice(0, 4)
  const visibleCards = strongest ? visibleTop.filter((point) => point.store.id !== strongest.store.id).slice(0, 8) : visibleTop
  const sortLabel =
    sort === 'share' ? '比率が高い順' : sort === 'signals' ? '根拠が多い順' : sort === 'updated' ? '更新が新しい順' : '女性書き込み順'
  const sessionLabel = sessionFilter === 'current' ? '今から行ける' : sessionFilter === 'day' ? '昼営業' : sessionFilter === 'night' ? '夜営業' : '全時間'
  const signalLabel = signalFilter === 'female' ? '女性反応あり' : signalFilter === 'event' ? 'イベントあり' : signalFilter === 'budget' ? '安め' : '条件なし'

  return (
    <section className="store-discovery-card" aria-label="店舗探索">
      <div className="store-discovery-head">
        <div>
          <span>候補を探す</span>
          <h2>今夜の行き先を決める</h2>
          <p>検索ではなく、行ける条件を押して候補を減らします。判断は5指標だけです。</p>
          <div className="store-in-app-note">
            <span>アプリ内完結</span>
            <strong>保存した候補は条件を変えても残ります。</strong>
          </div>
        </div>
        <dl>
          <div>
            <dt>最上位</dt>
            <dd>{strongest ? formatBarName(strongest.store.name) : '未判定'}</dd>
          </div>
          <div>
            <dt>候補</dt>
            <dd>{candidateCount}件</dd>
          </div>
          <div>
            <dt>お気に入り</dt>
            <dd>{favoriteCount}件</dd>
          </div>
          <div>
            <dt>表示</dt>
            <dd>
              {points.length}/{totalCount}
            </dd>
          </div>
        </dl>
      </div>

      <div className="store-explorer-controls">
        <label className="store-search-box">
          <MagnifyingGlass size={17} weight="bold" />
          <input
            aria-label="店舗名やエリアで探す"
            autoComplete="off"
            placeholder="店舗名・エリアで探す"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </label>
        <select aria-label="並び替え" value={sort} onChange={(event) => onSortChange(event.target.value as StoreSortKey)}>
          <option value="hot">女性書き込み順</option>
          <option value="share">比率が高い順</option>
          <option value="signals">根拠が多い順</option>
          <option value="updated">更新が新しい順</option>
        </select>
      </div>

      <div className="store-filter-row" aria-label="店舗フィルタ">
        <button
          type="button"
          aria-pressed={sessionFilter === 'all' && signalFilter === 'all'}
          onClick={() => {
            onSessionFilterChange('all')
            onSignalFilterChange('all')
          }}
        >
          すべて
        </button>
        <button type="button" aria-pressed={sessionFilter === 'current'} onClick={() => onSessionFilterChange('current')}>
          今から行ける
        </button>
        <button type="button" aria-pressed={signalFilter === 'female'} onClick={() => onSignalFilterChange('female')}>
          女性反応あり
        </button>
        <button type="button" aria-pressed={signalFilter === 'event'} onClick={() => onSignalFilterChange('event')}>
          イベントあり
        </button>
        <button type="button" aria-pressed={signalFilter === 'budget'} onClick={() => onSignalFilterChange('budget')}>
          安め
        </button>
        <button type="button" aria-pressed={sessionFilter === 'day'} onClick={() => onSessionFilterChange('day')}>
          昼営業
        </button>
        <button type="button" aria-pressed={sessionFilter === 'night'} onClick={() => onSessionFilterChange('night')}>
          夜営業
        </button>
      </div>

      <div className="store-filter-status" aria-live="polite">
        <span>
          営業分 {points.length}/{totalCount}
        </span>
        <strong>{sortLabel}</strong>
        <em>
          {sessionLabel} / {signalLabel}
        </em>
      </div>

      <div className="store-decision-strip" aria-label="候補整理">
        <article>
          <span>候補入り</span>
          <strong>{candidateCount}件</strong>
        </article>
        <article>
          <span>お気に入り</span>
          <strong>{favoriteCount}件</strong>
        </article>
        <article>
          <span>今回は非表示</span>
          <strong>{hiddenCount}件</strong>
        </article>
        <button type="button" onClick={onReset}>
          条件を戻す
        </button>
      </div>

      <div className={`store-candidate-dock${candidatePoints.length ? '' : ' is-empty'}`} aria-label="候補店舗">
        <div>
          <span>候補リスト</span>
          <strong>{candidatePoints.length ? '今日見返す店舗' : '気になる店舗を一時保存'}</strong>
          <p>{candidatePoints.length ? '条件を変えても、候補入りした店舗はここに残ります。' : 'ランキングから候補に入れると、比較用にここへまとまります。'}</p>
        </div>
        {candidatePoints.length ? (
          <div className="store-candidate-list">
            {candidatePoints.map((point) => (
              <button type="button" key={point.store.id} onClick={() => onOpenDetail(point.store.id)}>
                <span>#{point.rank}</span>
                <strong>{formatBarName(point.store.name)}</strong>
                <em>{point.score}点</em>
              </button>
            ))}
          </div>
        ) : (
          <button type="button" onClick={onReset}>
            条件を戻して探す
          </button>
        )}
      </div>

      {strongest ? (
        <StoreSpotlightCard
          analytics={analyticsByStoreId.get(strongest.store.id)}
          decision={storeDecisions[strongest.store.id]}
          eventCount={eventCountByStoreId.get(strongest.store.id) ?? 0}
          genderRanking={genderRankingByStoreId.get(strongest.store.id)}
          point={strongest}
          source={sourceByStoreId.get(strongest.store.id)}
          onDecisionChange={onDecisionChange}
          onOpenDetail={onOpenDetail}
        />
      ) : null}

      <div className="store-explorer-grid">
        {visibleCards.length ? (
          visibleCards.map((point, index) => (
            <StoreExplorerCard
              analytics={analyticsByStoreId.get(point.store.id)}
              decision={storeDecisions[point.store.id]}
              eventCount={eventCountByStoreId.get(point.store.id) ?? 0}
              genderRanking={genderRankingByStoreId.get(point.store.id)}
              key={point.store.id}
              point={point}
              rank={point.rank || index + 1}
              source={sourceByStoreId.get(point.store.id)}
              onDecisionChange={onDecisionChange}
              onOpenDetail={onOpenDetail}
            />
          ))
        ) : (
          <p className="muted-note">条件に合う店舗がありません。条件を戻すか、候補入り店舗を解除して表示を戻してください。</p>
        )}
      </div>
    </section>
  )
}

function StoreSpotlightCard({
  analytics,
  decision,
  eventCount,
  genderRanking,
  point,
  source,
  onDecisionChange,
  onOpenDetail,
}: {
  analytics?: StoreBbsAnalytics
  decision?: StoreDecisionState
  eventCount: number
  genderRanking?: GenderPostRanking
  point: StoreRadarPoint
  source?: BbsSource
  onDecisionChange: (storeId: string, state: StoreDecisionState) => void
  onOpenDetail: (storeId: string) => void
}) {
  const todayFit = todayCompatibilityLabel(analytics)
  const decisionMetrics = buildDecisionMetrics(point, genderRanking, source, eventCount)
  const rankLabel = storeRankLabel(point.rank)

  return (
    <article className={`store-spotlight-card is-${point.tone} ${decision ? `decision-${decision}` : ''}`} aria-label="本命店舗">
      <div className="store-spotlight-copy">
        <div className="store-spotlight-labels">
          <span>いま最初に見る店舗</span>
          {rankLabel ? <em className={`store-rank-label is-rank-${point.rank}`}>{rankLabel}</em> : null}
        </div>
        <h3>{formatBarName(point.store.name)}</h3>
        <p>{point.verdict}。{todayFit}</p>
      </div>
      <div className="store-spotlight-score">
        <strong>{point.score}</strong>
        <span>点</span>
      </div>
      <StoreInlineRadar point={point} ranking={genderRanking} variant="featured" />
      <DecisionMetricList metrics={decisionMetrics} />
      <div className="store-spotlight-actions">
        <button
          type="button"
          className={decision === 'candidate' ? 'is-active' : ''}
          onClick={() => onDecisionChange(point.store.id, 'candidate')}
        >
          {decision === 'candidate' ? '候補から外す' : '候補に入れる'}
        </button>
        <button type="button" onClick={() => onOpenDetail(point.store.id)}>
          店舗詳細
        </button>
      </div>
    </article>
  )
}

function StoreExplorerCard({
  analytics,
  decision,
  eventCount,
  genderRanking,
  point,
  rank,
  source,
  onDecisionChange,
  onOpenDetail,
}: {
  analytics?: StoreBbsAnalytics
  decision?: StoreDecisionState
  eventCount: number
  genderRanking?: GenderPostRanking
  point: StoreRadarPoint
  rank: number
  source?: BbsSource
  onDecisionChange: (storeId: string, state: StoreDecisionState) => void
  onOpenDetail: (storeId: string) => void
}) {
  const todayFit = todayCompatibilityLabel(analytics)
  const decisionMetrics = buildDecisionMetrics(point, genderRanking, source, eventCount)
  const rankLabel = storeRankLabel(point.rank || rank)
  const decisionLabel =
    decision === 'candidate' ? '候補' : decision === 'favorite' ? 'お気に入り' : decision === 'hidden' ? '非表示' : '比較中'

  return (
    <article className={`store-explorer-card is-${point.tone} ${decision ? `decision-${decision}` : ''}`}>
      <div className="store-rank-line">
        <span className="store-rank-badge">#{rank}</span>
        {rankLabel ? <span className={`store-rank-label is-rank-${point.rank || rank}`}>{rankLabel}</span> : null}
        <span className={`store-decision-badge ${decision ? `is-${decision}` : ''}`}>{decisionLabel}</span>
      </div>
      <div className="store-card-top">
        <div>
          <span>
            {formatStoreArea(point.store.area)} / {formatStoreSessionLabel(point.store)}
          </span>
          <strong>{formatBarName(point.store.name)}</strong>
        </div>
        <em>{point.score}</em>
      </div>

      <div className="store-card-meter" aria-label={`盛り上がり ${point.score}点`}>
        <i style={{ inlineSize: `${Math.max(4, Math.min(100, point.score))}%` }} />
      </div>

      <p>{point.verdict}</p>

      <StoreInlineRadar point={point} ranking={genderRanking} />

      <DecisionMetricList metrics={decisionMetrics} />

      <div className="store-card-note">
        <span>{todayFit}</span>
        <em>{formatRadarCapturedAt(point.lastCapturedAt)}</em>
      </div>

      <div className="store-card-actions">
        <button
          type="button"
          className={decision === 'candidate' ? 'is-active' : ''}
          onClick={() => onDecisionChange(point.store.id, 'candidate')}
        >
          {decision === 'candidate' ? '候補から外す' : '候補に入れる'}
        </button>
        <button type="button" onClick={() => onOpenDetail(point.store.id)}>
          店舗詳細
        </button>
      </div>
      <details className="store-more-actions">
        <summary>その他</summary>
        <div>
          <button
            type="button"
            className={decision === 'favorite' ? 'is-active' : ''}
            onClick={() => onDecisionChange(point.store.id, 'favorite')}
          >
            <Star size={13} weight={decision === 'favorite' ? 'fill' : 'bold'} />
            {decision === 'favorite' ? 'お気に入り解除' : 'お気に入り'}
          </button>
          <button type="button" onClick={() => onDecisionChange(point.store.id, 'hidden')}>
            今回は非表示
          </button>
        </div>
      </details>
    </article>
  )
}

function storeRankLabel(rank?: number) {
  if (rank === 1) return 'ヤバすぎて滅店'
  if (rank === 2) return '爆アゲ店'
  if (rank === 3) return '激アツ店'
  return ''
}

function StoreDetailDrawer({
  analytics,
  decision,
  eventCount,
  genderRanking,
  point,
  source,
  onClose,
  onDecisionChange,
}: {
  analytics?: StoreBbsAnalytics
  decision?: StoreDecisionState
  eventCount: number
  genderRanking?: GenderPostRanking
  point: StoreRadarPoint
  source?: BbsSource
  onClose: () => void
  onDecisionChange: (storeId: string, state: StoreDecisionState) => void
}) {
  const displaySignals = getDisplaySignalCounts(point, genderRanking)
  const primaryUrl = resolveStorePrimaryUrl(point.store, source)
  const faviconUrl = resolveStoreFaviconUrl(primaryUrl)
  const mapUrl = resolveStoreMapUrl(point.store)
  const phone = point.store.phone?.trim()
  const decisionMetrics = buildDecisionMetrics(point, genderRanking, source, eventCount)
  const signalReasons = [
    displaySignals.female ? `女性表記 ${displaySignals.female}件` : '',
    displaySignals.first ? `初回系 ${displaySignals.first}件` : '',
    displaySignals.comeback ? `久しぶり系 ${displaySignals.comeback}件` : '',
    displaySignals.group ? `複数来店 ${displaySignals.group}件` : '',
    eventCount ? `月間イベント ${eventCount}件` : '',
  ].filter(Boolean)
  const todayFit = todayCompatibilityLabel(analytics)

  return (
    <div className="store-detail-layer" role="presentation" onClick={onClose}>
      <aside className="store-detail-panel" aria-label={`${formatBarName(point.store.name)}の詳細`} onClick={(event) => event.stopPropagation()}>
        <header>
          <button type="button" onClick={onClose}>
            閉じる
          </button>
          <span>行く前チェック</span>
          <h2>{formatBarName(point.store.name)}</h2>
          <p>{point.verdict}</p>
        </header>

        <div className="store-detail-score">
          <strong>{point.score}</strong>
          <div>
            <span>盛り上がり</span>
            <i style={{ inlineSize: `${Math.max(4, Math.min(100, point.score))}%` }} />
          </div>
          <em>{point.share}%</em>
        </div>

        <StoreInlineRadar point={point} ranking={genderRanking} variant="detail" />

        <DecisionMetricList metrics={decisionMetrics} />

        <section className="store-contact-card" aria-label="店舗基本情報">
          <div className="store-contact-title">
            <span>基本情報</span>
            <strong>移動前に開くもの</strong>
          </div>
          <dl>
            <div className="store-contact-url">
              <dt>店舗URL</dt>
              <dd>
                {faviconUrl ? <img alt="" src={faviconUrl} width={18} height={18} loading="lazy" /> : <span className="store-favicon-placeholder">N</span>}
                {primaryUrl ? (
                  <a href={primaryUrl} target="_blank" rel="noreferrer">
                    {primaryUrl}
                  </a>
                ) : (
                  <span>{storeDetailValue(primaryUrl)}</span>
                )}
              </dd>
            </div>
            <div>
              <dt>電話番号</dt>
              <dd>
                {phone ? (
                  <a href={`tel:${phone.replace(/[^\d+]/g, '')}`}>{phone}</a>
                ) : (
                  <span>{storeDetailValue(phone)}</span>
                )}
              </dd>
            </div>
            <div>
              <dt>地図URL</dt>
              <dd>
                <a href={mapUrl} target="_blank" rel="noreferrer">
                  {mapUrl}
                </a>
              </dd>
            </div>
            <div>
              <dt>料金</dt>
              <dd>{point.store.priceNote?.trim() || '公式で確認'}</dd>
            </div>
          </dl>
        </section>

        <dl className="store-detail-metrics">
          <div>
            <dt>BBS取得</dt>
            <dd>{sourceReliabilityLabel(source)}</dd>
          </div>
          <div>
            <dt>掲示板</dt>
            <dd>{source?.url ? 'あり' : '未登録'}</dd>
          </div>
          <div>
            <dt>地図</dt>
            <dd>開けます</dd>
          </div>
          <div>
            <dt>相性</dt>
            <dd>{todayFit}</dd>
          </div>
        </dl>

        <section className="store-detail-section">
          <span>見るべき根拠</span>
          {signalReasons.length ? (
            <ul>
              {signalReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : (
            <p>巡回データが増えると、判断材料がここにまとまります。</p>
          )}
        </section>

        <section className="store-detail-section">
          <span>運用メモ</span>
          <p>{analytics?.verdict ? `${todayFit}。${analytics.verdict}` : 'BBS投稿とスクリーンショットを蓄積中です。'}</p>
          <small>最終更新: {formatRadarCapturedAt(point.lastCapturedAt)} / BBS: {formatUserBbsStatus(source?.lastStatus)}</small>
          <small>料金: {point.store.priceNote?.trim() || '公式で確認'} / 場所: {point.store.address?.trim() || formatStoreArea(point.store.area)}</small>
        </section>

        {source?.url ? (
          <a className="store-source-link" href={source.url} target="_blank" rel="noreferrer">
            掲示板を開く
          </a>
        ) : null}

        <div className="store-detail-actions">
          <button
            type="button"
            className={decision === 'candidate' ? 'is-active' : ''}
            onClick={() => onDecisionChange(point.store.id, 'candidate')}
          >
            {decision === 'candidate' ? '候補から戻す' : '候補に入れる'}
          </button>
          <button
            type="button"
            className={decision === 'favorite' ? 'is-active' : ''}
            onClick={() => onDecisionChange(point.store.id, 'favorite')}
          >
            {decision === 'favorite' ? 'お気に入り解除' : 'お気に入り'}
          </button>
          <button type="button" onClick={() => onDecisionChange(point.store.id, 'watch')}>
            保留にする
          </button>
        </div>
      </aside>
    </div>
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
          {formatEventDateLabel(event)} {event.startsAt} / {event.reasons.join('、')}
        </small>
      </div>
      <em>{event.score}</em>
    </article>
  )
}

type CalendarEventFilter = 'all' | 'day' | 'night' | 'highlight'
type CalendarEventTag = '月1' | 'ビンゴ' | '誕生日'

function MonthlyCalendarPreview({
  events,
  focusMode = false,
  stores,
}: {
  events: EventInput[]
  focusMode?: boolean
  stores: StoreProfile[]
}) {
  const monthOptions = useMemo(() => buildCalendarMonthOptions(events), [events])
  const defaultMonthKey = useMemo(() => selectDefaultCalendarMonth(monthOptions), [monthOptions])
  const [selectedMonthKey, setSelectedMonthKey] = useState(defaultMonthKey)
  const [eventFilter, setEventFilter] = useState<CalendarEventFilter>('all')
  const [eventQuery, setEventQuery] = useState('')
  const activeMonthKey = monthOptions.some((month) => month.key === selectedMonthKey) ? selectedMonthKey : defaultMonthKey
  const activeMonth = monthOptions.find((month) => month.key === activeMonthKey)
  const cells = useMemo(
    () => buildCalendarPreviewCells(events, stores, activeMonthKey, eventFilter, eventQuery),
    [activeMonthKey, eventFilter, eventQuery, events, stores],
  )
  const eventCount = cells.reduce((sum, cell) => sum + cell.items.length, 0)
  const monthStats = useMemo(() => buildCalendarMonthStats(events, stores, activeMonthKey, eventQuery), [activeMonthKey, eventQuery, events, stores])
  const [selectedDay, setSelectedDay] = useState<CalendarPreviewCell | null>(null)
  useBodyScrollLock(Boolean(selectedDay))
  const hasCalendarFilter = eventFilter !== 'all' || Boolean(eventQuery.trim())

  const openDrawerOnSmallScreen = (cell: CalendarPreviewCell) => {
    if (cell.isBlank || !cell.items.length) return
    if (window.matchMedia('(max-width: 760px)').matches) setSelectedDay(cell)
  }

  const toggleEventFilter = (filter: CalendarEventFilter) => {
    setEventFilter((current) => (current === filter ? 'all' : filter))
  }

  const clearCalendarFilters = () => {
    setEventFilter('all')
    setEventQuery('')
  }

  return (
    <section className={`calendar-preview-card${focusMode ? ' is-focus' : ''}`} id="top-calendar" aria-label="月間イベント">
      <div className="calendar-preview-head">
        <CalendarDots size={20} weight="bold" />
        <div>
          <span>月間イベント</span>
          <strong>{activeMonth?.displayLabel ?? '未設定'}</strong>
        </div>
        <em>{eventCount}件</em>
      </div>
      <label className="calendar-search-box">
        <MagnifyingGlass size={17} weight="bold" />
        <input
          aria-label="月間イベントを検索"
          autoComplete="off"
          placeholder="店舗名・イベント名・気になるワードで検索"
          value={eventQuery}
          onChange={(event) => setEventQuery(event.target.value)}
        />
        {eventQuery ? (
          <button aria-label="イベント検索を解除" type="button" onClick={() => setEventQuery('')}>
            <X size={15} weight="bold" />
          </button>
        ) : null}
      </label>
      <div className="calendar-event-tabs" aria-label="イベント表示切り替え">
        <button type="button" aria-pressed={eventFilter === 'all'} onClick={() => setEventFilter('all')}>
          すべて
          <em>{monthStats.all}</em>
        </button>
        <button type="button" aria-pressed={eventFilter === 'day'} onClick={() => toggleEventFilter('day')}>
          朝イベ
          <em>{monthStats.day}</em>
        </button>
        <button type="button" aria-pressed={eventFilter === 'night'} onClick={() => toggleEventFilter('night')}>
          夜イベ
          <em>{monthStats.night}</em>
        </button>
        <button type="button" aria-pressed={eventFilter === 'highlight'} onClick={() => toggleEventFilter('highlight')}>
          注目
          <em>{monthStats.highlight}</em>
        </button>
      </div>
      <div className="calendar-filter-summary" aria-live="polite">
        <span>
          表示中: {calendarFilterLabel(eventFilter)}
          {eventQuery.trim() ? ` / 検索「${eventQuery.trim()}」` : ''}
        </span>
        {hasCalendarFilter ? (
          <button type="button" onClick={clearCalendarFilters}>
            フィルタを外す
          </button>
        ) : (
          <em>条件なし</em>
        )}
      </div>
      <div className="calendar-highlight-strip" aria-label="注目イベント種別">
        <span>チェック対象</span>
        <strong>月1</strong>
        <strong>ビンゴ</strong>
        <strong>スタッフ誕生日</strong>
        <em>該当イベントは日付内で強調します</em>
      </div>
      {monthOptions.length > 1 ? (
        <div className="calendar-month-switcher" aria-label="表示月">
          {monthOptions.slice(0, 4).map((month) => (
            <button
              aria-pressed={month.key === activeMonthKey}
              key={month.key}
              type="button"
              onClick={() => setSelectedMonthKey(month.key)}
            >
              {month.shortLabel}
              <em>{month.eventCount}</em>
            </button>
          ))}
        </div>
      ) : null}
      <div className="mini-month-grid" role="grid" aria-label={`${activeMonth?.label ?? '月間'}の店舗イベント`}>
        {['月', '火', '水', '木', '金', '土', '日'].map((day) => (
          <span className="mini-weekday" key={day}>
            {day}
          </span>
        ))}
        {cells.map((cell) => {
          const visibleItems = cell.items.slice(0, 2)
          const extraCount = Math.max(0, cell.items.length - visibleItems.length)

          return (
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
                    {visibleItems.map((item, index) => (
                      <span className={`event-color-${item.tone} ${item.tags.length ? 'is-highlight' : ''}`} key={`${cell.key}-${item.id}-${index}`}>
                        <b>{item.session === 'day' ? '朝' : '夜'}</b>
                        {item.storeName}
                        <small>{item.title}</small>
                      </span>
                    ))}
                    {cell.items.length ? <em>{extraCount ? `+${extraCount}` : `${cell.items.length}件`}</em> : null}
                  </div>
                </button>
              )}
              {cell.items.length ? <TopCalendarDayPanel cell={cell} variant="popover" /> : null}
            </article>
          )
        })}
      </div>
      <p>
        {eventCount
          ? `${activeMonth?.label ?? '選択月'}の${calendarFilterLabel(eventFilter)}を表示中です。日付を開くと詳細、公式ページ、注目タグを確認できます。`
          : `${calendarFilterLabel(eventFilter)}に該当する予定はまだありません。表示を「すべて」に戻すと全イベントを確認できます。`}
      </p>
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
                {item.startsAt || '時間未定'} / {item.session === 'day' ? '朝イベ' : '夜イベ'} / {item.category}
              </span>
            </div>
            {item.tags.length ? (
              <div className="calendar-event-tags" aria-label="注目タグ">
                {item.tags.map((tag) => (
                  <em key={tag}>{tag}</em>
                ))}
              </div>
            ) : null}
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
  tags: CalendarEventTag[]
  details?: string
  sourceUrl?: string
}

type CalendarMonthOption = {
  key: string
  label: string
  shortLabel: string
  displayLabel: string
  eventCount: number
}

const calendarMonthFormatter = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long' })

function calendarFilterLabel(filter: CalendarEventFilter) {
  if (filter === 'day') return '朝イベ'
  if (filter === 'night') return '夜イベ'
  if (filter === 'highlight') return '注目イベント'
  return '月間イベント'
}

function eventMonthKey(event: EventInput) {
  return /^\d{4}-\d{2}-\d{2}$/.test(event.date) ? event.date.slice(0, 7) : monthKeyInJapan()
}

function calendarEventText(event: EventInput) {
  return `${event.title} ${event.category} ${event.details ?? ''}`.normalize('NFKC').toLowerCase()
}

function calendarEventSearchText(event: EventInput, stores: StoreProfile[]) {
  return normalizeLocalSearchText(
    [
      resolveStoreDisplayName(stores, event.storeId),
      event.title,
      event.category,
      event.details ?? '',
      event.startsAt,
      event.session === 'day' ? '朝 昼 day' : '夜 night',
    ].join(' '),
  )
}

function getCalendarEventTags(event: EventInput): CalendarEventTag[] {
  const text = calendarEventText(event)
  const tags: CalendarEventTag[] = []
  if (/(月1|月一|月イチ|毎月|monthly)/i.test(text)) tags.push('月1')
  if (/(ビンゴ|bingo)/i.test(text)) tags.push('ビンゴ')

  const hasBirthdayWord = /(誕生日|生誕|バースデー|birthday|スタッフ.*(bd|誕)|staff.*birthday|bd)/i.test(text)
  const hasVisitNoticeContext = /(来店予告|来店予定|出勤予定|出勤予告|予告)/.test(text)
  const hasStaffContext = /(スタッフ|staff|店員|キャスト)/i.test(text)
  const hasCongratsWord = /(おめでとう|おめ|お祝い|祝|happy\s*birthday|hbd)/i.test(text)
  if (hasBirthdayWord || (hasCongratsWord && (hasVisitNoticeContext || hasStaffContext))) {
    tags.push('誕生日')
  }
  return tags
}

function eventMatchesCalendarFilter(event: EventInput, filter: CalendarEventFilter) {
  if (filter === 'all') return true
  if (filter === 'day') return event.session === 'day'
  if (filter === 'night') return event.session === 'night'
  return getCalendarEventTags(event).length > 0
}

function eventMatchesCalendarQuery(event: EventInput, stores: StoreProfile[], query: string) {
  const normalizedQuery = normalizeLocalSearchText(query)
  if (!normalizedQuery) return true
  return calendarEventSearchText(event, stores).includes(normalizedQuery)
}

function buildCalendarMonthStats(events: EventInput[], stores: StoreProfile[], monthKey: string, query = '') {
  return events.reduce(
    (stats, event) => {
      if (eventMonthKey(event) !== monthKey) return stats
      if (!eventMatchesCalendarQuery(event, stores, query)) return stats
      stats.all += 1
      if (event.session === 'day') stats.day += 1
      else stats.night += 1
      if (getCalendarEventTags(event).length) stats.highlight += 1
      return stats
    },
    { all: 0, day: 0, night: 0, highlight: 0 },
  )
}

function buildCalendarMonthOptions(events: EventInput[]): CalendarMonthOption[] {
  const counts = events.reduce<Map<string, number>>((map, event) => {
    const key = eventMonthKey(event)
    map.set(key, (map.get(key) ?? 0) + 1)
    return map
  }, new Map())

  if (!counts.size) {
    const key = monthKeyInJapan()
    counts.set(key, 0)
  }

  return [...counts.entries()].toSorted(([a], [b]) => a.localeCompare(b)).map(([key, eventCount]) => {
    const [year, month] = key.split('-').map(Number)
    const date = dateFromJapanParts(year, month, 1)
    return {
      key,
      label: calendarMonthFormatter.format(date),
      shortLabel: `${month}月`,
      displayLabel: `${year}.${String(month).padStart(2, '0')}`,
      eventCount,
    }
  })
}

function selectDefaultCalendarMonth(months: CalendarMonthOption[]) {
  const current = monthKeyInJapan()
  return months.find((month) => month.key === current)?.key ?? months.find((month) => month.key > current)?.key ?? months[0]?.key ?? current
}

function buildCalendarPreviewCells(
  events: EventInput[],
  stores: StoreProfile[],
  monthKey: string,
  filter: CalendarEventFilter = 'all',
  query = '',
): CalendarPreviewCell[] {
  const [year, month] = monthKey.split('-').map(Number)
  const daysInMonth = daysInMonthInJapan(year, month)
  const firstDay = weekdayIndexForJapanDate(year, month, 1)
  const leadingBlanks = (firstDay + 6) % 7
  const [todayYear, todayMonth, todayDayValue] = dateKeyInJapan().split('-').map(Number)
  const todayDay = todayYear === year && todayMonth === month ? todayDayValue : 0
  const eventDays = new Map<number, CalendarPreviewItem[]>()

  for (const event of events) {
    if (!eventMatchesCalendarFilter(event, filter)) continue
    if (!eventMatchesCalendarQuery(event, stores, query)) continue
    const day = resolveEventDay(event, year, month)
    if (!day) continue
    const storeName = resolveStoreDisplayName(stores, event.storeId)
    const tags = getCalendarEventTags(event)
    eventDays.set(day, [
      ...(eventDays.get(day) ?? []),
      {
        id: event.id,
        label: storeName,
        tone: tags.length ? 2 : event.session === 'day' ? 1 : 0,
        storeName,
        startsAt: event.startsAt,
        session: event.session,
        category: event.category,
        title: event.title,
        tags,
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
      dateLabel: `${month}/${day}(${weekdayLabelForJapanDate(year, month, day).replace('曜', '')})`,
      day,
      isBlank: false,
      isToday: day === todayDay,
      items: unique,
    })
  }

  return cells
}

function resolveEventDay(event: EventInput, year: number, month: number) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(event.date)) {
    const [eventYear, eventMonth, eventDay] = event.date.split('-').map(Number)
    if (eventYear === year && eventMonth === month) return eventDay
    return 0
  }

  const [todayYear, todayMonth, todayDay] = dateKeyInJapan().split('-').map(Number)
  if (event.date === '今日') return todayYear === year && todayMonth === month ? todayDay : 0
  if (event.date === '明日') {
    const [tomorrowYear, tomorrowMonth, tomorrowDay] = dateKeyInJapan(relativeDateInJapan(1)).split('-').map(Number)
    return tomorrowYear === year && tomorrowMonth === month ? tomorrowDay : 0
  }

  const weekdayIndex = ['日曜', '月曜', '火曜', '水曜', '木曜', '金曜', '土曜'].indexOf(eventWeekday(event))
  if (weekdayIndex < 0) return 0
  const firstDayIndex = weekdayIndexForJapanDate(year, month, 1)
  const day = 1 + ((weekdayIndex - firstDayIndex + 7) % 7)
  return day <= daysInMonthInJapan(year, month) ? day : 0
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
  return normalizeWatchedSearchText(value)
}

function normalizedLocalMatchIndex(body: string, term: string) {
  const normalizedTerm = normalizeLocalSearchText(term)
  if (!normalizedTerm) return -1

  let normalizedBody = ''
  const rawIndices: number[] = []
  let rawIndex = 0

  for (const character of body) {
    const normalizedCharacter = normalizeLocalSearchText(character)
    for (let index = 0; index < normalizedCharacter.length; index += 1) {
      rawIndices.push(rawIndex)
    }
    normalizedBody += normalizedCharacter
    rawIndex += character.length
  }

  const normalizedIndex = normalizedBody.indexOf(normalizedTerm)
  return normalizedIndex >= 0 ? (rawIndices[normalizedIndex] ?? -1) : -1
}

function dedupeWatchedHitsByStore(hits: WatchedWordHit[]) {
  const seenStoreIds = new Set<string>()
  return hits.filter((hit) => {
    if (seenStoreIds.has(hit.store.id)) return false
    seenStoreIds.add(hit.store.id)
    return true
  })
}

function normalizedLocalMatchRange(body: string, term: string) {
  const normalizedTerm = normalizeLocalSearchText(term)
  if (!normalizedTerm) return null

  let normalizedBody = ''
  const rawStarts: number[] = []
  const rawEnds: number[] = []
  let rawIndex = 0

  for (const character of body) {
    const normalizedCharacter = normalizeLocalSearchText(character)
    for (let index = 0; index < normalizedCharacter.length; index += 1) {
      rawStarts.push(rawIndex)
      rawEnds.push(rawIndex + character.length)
    }
    normalizedBody += normalizedCharacter
    rawIndex += character.length
  }

  const normalizedIndex = normalizedBody.indexOf(normalizedTerm)
  if (normalizedIndex < 0) return null

  return {
    start: rawStarts[normalizedIndex] ?? 0,
    end: rawEnds[normalizedIndex + normalizedTerm.length - 1] ?? rawStarts[normalizedIndex] + term.length,
  }
}

function buildLocalSnippet(body: string, term: string) {
  const exactIndex = body.indexOf(term)
  const normalizedIndex = normalizedLocalMatchIndex(body, term)
  const index = exactIndex >= 0 ? exactIndex : normalizedIndex
  if (index < 0) return body.slice(0, 96)
  const start = Math.max(0, index - 32)
  const end = Math.min(body.length, index + term.length + 48)
  return `${start > 0 ? '…' : ''}${body.slice(start, end)}${end < body.length ? '…' : ''}`
}

function buildCustomWatchedWordHits(
  posts: PostRecord[],
  stores: StoreProfile[],
  term: string,
  selectedStoreId = 'all',
): WatchedWordHit[] {
  const query = term.trim()
  const normalizedQuery = normalizeLocalSearchText(query)
  if (!normalizedQuery) return []

  const storeMap = new Map(stores.map((store) => [store.id, store]))
  const scopedStoreId = selectedStoreId && selectedStoreId !== 'all' ? selectedStoreId : null
  const hits: WatchedWordHit[] = []

  posts.forEach((post) => {
    if (scopedStoreId && post.storeId !== scopedStoreId) return
    const store = storeMap.get(post.storeId)
    if (!store) return
    const watchedText = extractWatchedAuthorText(post.body)
    if (!watchedText) return
    if (!watchedText.includes(query) && !normalizeLocalSearchText(watchedText).includes(normalizedQuery)) return

    hits.push({
      id: `custom-${post.id}-${normalizedQuery}`,
      label: '任意ワード',
      term: query,
      store,
      post,
      snippet: buildLocalSnippet(watchedText, query),
      severity: 'medium',
    })
  })

  return hits.toSorted((a, b) => new Date(b.post.postedAt).getTime() - new Date(a.post.postedAt).getTime())
}

function buildHighlightRanges(text: string, term: string) {
  const query = term.trim()
  if (!query) return []

  const ranges: Array<{ start: number; end: number }> = []
  let index = text.indexOf(query)
  while (index >= 0) {
    ranges.push({ start: index, end: index + query.length })
    index = text.indexOf(query, index + Math.max(1, query.length))
  }

  if (ranges.length) return ranges

  const normalizedRange = normalizedLocalMatchRange(text, query)
  return normalizedRange ? [normalizedRange] : []
}

function renderHighlightedText(text: string, term: string) {
  const ranges = buildHighlightRanges(text, term)
  if (!ranges.length) return text

  const nodes: ReactNode[] = []
  let cursor = 0
  ranges.forEach((range, index) => {
    if (range.start > cursor) nodes.push(text.slice(cursor, range.start))
    nodes.push(
      <mark className="watch-highlight" key={`${range.start}-${range.end}-${index}`}>
        {text.slice(range.start, range.end)}
      </mark>,
    )
    cursor = range.end
  })
  if (cursor < text.length) nodes.push(text.slice(cursor))
  return nodes
}

function splitLongReadableLine(line: string, limit = 92) {
  if (line.length <= limit) return [line]

  const chunks: string[] = []
  let rest = line
  while (rest.length > limit) {
    const searchArea = rest.slice(0, limit)
    const breakAt = Math.max(
      searchArea.lastIndexOf('。'),
      searchArea.lastIndexOf('！'),
      searchArea.lastIndexOf('？'),
      searchArea.lastIndexOf('、'),
      searchArea.lastIndexOf(' '),
    )
    const cut = breakAt >= 32 ? breakAt + 1 : limit
    chunks.push(rest.slice(0, cut).trim())
    rest = rest.slice(cut).trim()
  }
  if (rest) chunks.push(rest)
  return chunks
}

function buildReadableBbsLines(body: string) {
  const prepared = body
    .replace(/\r\n?/g, '\n')
    .replace(/(投稿者[:：])/g, '\n$1')
    .replace(/(投稿日時?[:：]|投稿日[:：]|書き込み[:：]|記事番号[:：]?|No[.\s]*\d+|Re[:：]|返信[:：])/g, '\n$1')
    .replace(/(20\d{2}[年/-]\d{1,2}[月/-]\d{1,2}日?\s*\d{0,2}:?\d{0,2})/g, '\n$1')
    .replace(/([。！？!?])(?=\S)/g, '$1\n')

  return prepared
    .split('\n')
    .map((line) => line.replace(/[ \t\u3000]+/g, ' ').trim())
    .filter(Boolean)
    .flatMap((line) => splitLongReadableLine(line))
}

type ReadableBbsEntry = {
  id: string
  nameLabel: string
  timeLabel: string
  genderLabel: string
  lines: string[]
}

function splitReadableBlock(block: string) {
  return block
    .replace(/\r\n?/g, '\n')
    .replace(/(投稿者[:：])/g, '\n$1')
    .replace(/(投稿日時?[:：]|投稿日[:：]|書き込み[:：]?|記事番号[:：]?|No[.\s]*\d+|Re[:：]|返信[:：])/g, '\n$1')
    .replace(/(20\d{2}[年/-]\d{1,2}[月/-]\d{1,2}日?\s*\d{0,2}:?\d{0,2})/g, '\n$1')
    .replace(/([。！？!?])(?=\S)/g, '$1\n')
    .split('\n')
    .map((line) => line.replace(/[ \t\u3000]+/g, ' ').trim())
    .filter(Boolean)
}

function extractReadableTimeLabel(value: string) {
  const prefixedTime = value.match(/(?:投稿日時?|投稿日)[:：]?\s*([^\n]{4,42})/i)
  if (prefixedTime?.[1]) return prefixedTime[1].trim()

  const dateTime = value.match(
    /(20\d{2}[年/-]\d{1,2}[月/-]\d{1,2}日?(?:\([^)]+\))?\s*(?:[0-2]?\d[:時][0-5]?\d?(?::[0-5]?\d)?)?)/,
  )
  if (dateTime?.[1]) return dateTime[1].trim()

  const shortTime = value.match(/(?:^|\s)([0-2]?\d[:時][0-5]?\d)(?:\s|$)/)
  return shortTime?.[1]?.trim() ?? ''
}

function normalizeReadableGender(value: string) {
  if (/(女性|単女|女です|女子|♀|（女|\(女|\(女性|（女性)/i.test(value)) return '女性'
  if (/(男性|単男|男です|男子|♂|（男|\(男|\(男性|（男性)/i.test(value)) return '男性'
  if (/(カップル|二人組|2人組|２人組|ペア)/i.test(value)) return '複数'
  return '記載なし'
}

function cleanReadableName(value: string) {
  return value
    .replace(/^投稿者[:：]\s*/, '')
    .replace(/[（(]\s*(女性|男性|単女|単男|女|男)\s*[）)]/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanReadableBody(value: string) {
  return value
    .replace(/^書き込み[:：]?\s*/, '')
    .replace(/^削除\s*/, '')
    .replace(/^返信[:：]?\s*/, '')
    .replace(/\s+返信\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseReadableAuthorLine(line: string) {
  const raw = line.replace(/^投稿者[:：]\s*/, '').replace(/\s+/g, ' ').trim()
  const genderMatch = raw.match(/^(.+?)\s*[（(]\s*(女性|男性|単女|単男|女|男)\s*[）)]\s*(.*)$/i)
  if (genderMatch) {
    return {
      name: cleanReadableName(genderMatch[1] ?? ''),
      gender: normalizeReadableGender(genderMatch[2] ?? ''),
      body: cleanReadableBody(genderMatch[3] ?? ''),
    }
  }

  const contentMatch = raw.match(
    /^(.+?)\s+(?=(初めて|はじめて|久しぶり|今日|本日|明日|朝|昼|夜|行き|行く|伺|お邪魔|予定|よろしく|誰か|どなた|女性|男性|単男|単女|[0-9０-９]{1,2}\s*(時|:)))(.+)$/,
  )
  if (contentMatch) {
    return {
      name: cleanReadableName(contentMatch[1] ?? ''),
      gender: normalizeReadableGender(raw),
      body: cleanReadableBody(contentMatch[4] ?? ''),
    }
  }

  return {
    name: cleanReadableName(raw),
    gender: normalizeReadableGender(raw),
    body: '',
  }
}

function parseReadableNumberedLine(line: string) {
  const withoutNumber = line
    .replace(/^記事番号[:：]?\s*\d+\s*/i, '')
    .replace(/^No[.\s]*\d+\)?\s*/i, '')
    .trim()
  const cleaned = cleanReadableBody(withoutNumber)
  if (!cleaned) return null

  const trailingAuthor = cleaned.match(/^(.*?)\s+([^()\s]+(?:\s*さん)?)\s*[（(][^（）()]{3,}[）)]\s*$/)
  if (trailingAuthor) {
    return {
      name: cleanReadableName(trailingAuthor[2] ?? ''),
      gender: normalizeReadableGender(cleaned),
      body: cleanReadableBody(trailingAuthor[1] ?? ''),
    }
  }

  return {
    name: '',
    gender: normalizeReadableGender(cleaned),
    body: cleaned,
  }
}

function readableEntryMatchesTerm(entry: { name: string; gender: string }, term: string) {
  const query = normalizeLocalSearchText(term)
  if (!query) return true
  return normalizeLocalSearchText([entry.name, entry.gender].join(' ')).includes(query)
}

function buildReadableBbsEntries(body: string, fallbackTimeLabel: string, term = ''): ReadableBbsEntry[] {
  const authorEntries = extractWatchedAuthorEntries(body).filter((entry) => readableEntryMatchesTerm(entry, term))
  if (authorEntries.length || term.trim()) {
    return authorEntries.map((entry, index) => {
      const contentLines = splitLongReadableLine(cleanReadableBody(entry.body || '書き込み内容を抽出できませんでした。'))
      return {
        id: `author-${index}-${entry.name}-${entry.gender}-${contentLines.join('').slice(0, 20)}`,
        nameLabel: entry.name || '記載なし',
        timeLabel: fallbackTimeLabel,
        genderLabel: entry.gender,
        lines: contentLines,
      }
    })
  }

  const blocks = body
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)

  const sourceBlocks = blocks.length ? blocks : [body]
  const entries: ReadableBbsEntry[] = []

  function createEntry(block: string, index: number, nameLabel: string, genderLabel: string, timeLabel: string, lines: string[]) {
    const contentLines = lines.map(cleanReadableBody).filter(Boolean).flatMap((line) => splitLongReadableLine(line))
    if (!contentLines.length) return
    const joined = [nameLabel, genderLabel, ...contentLines].join(' ')
    entries.push({
      id: `${entries.length}-${index}-${timeLabel || fallbackTimeLabel}-${block.slice(0, 20)}`,
      nameLabel: nameLabel || '記載なし',
      timeLabel: timeLabel || fallbackTimeLabel,
      genderLabel: genderLabel === '記載なし' ? normalizeReadableGender(joined) : genderLabel,
      lines: contentLines,
    })
  }

  sourceBlocks.forEach((block, index) => {
    let nameLabel = ''
    let genderLabel = '記載なし'
    let timeLabel = ''
    const bodyLines: string[] = []
    const flush = () => {
      createEntry(block, index, nameLabel, genderLabel, timeLabel, bodyLines)
      nameLabel = ''
      genderLabel = '記載なし'
      timeLabel = ''
      bodyLines.length = 0
    }

    splitReadableBlock(block).forEach((line) => {
      if (/^(Re[:：]?|返信[:：]?)$/i.test(line)) return
      if (/^(記事番号[:：]?|No[.\s]*\d+)/i.test(line)) {
        const numbered = parseReadableNumberedLine(line)
        if (!numbered) {
          if (bodyLines.length) flush()
          return
        }
        if (bodyLines.length) flush()
        createEntry(block, index, numbered.name, numbered.gender, timeLabel, [numbered.body])
        return
      }
      if (/^(投稿日時?[:：]|投稿日[:：])/i.test(line)) {
        timeLabel ||= extractReadableTimeLabel(line)
        return
      }
      if (/^20\d{2}[年/-]\d{1,2}[月/-]\d{1,2}/.test(line)) {
        timeLabel ||= extractReadableTimeLabel(line)
        return
      }
      if (/^書き込み[:：]?/.test(line)) {
        const writtenBody = cleanReadableBody(line)
        if (writtenBody) bodyLines.push(...splitLongReadableLine(writtenBody))
        return
      }
      if (/^投稿者[:：]/.test(line)) {
        if (bodyLines.length) flush()
        const authorLine = parseReadableAuthorLine(line)
        nameLabel = authorLine.name
        genderLabel = authorLine.gender
        if (authorLine.body) bodyLines.push(...splitLongReadableLine(authorLine.body))
        return
      }
      timeLabel ||= extractReadableTimeLabel(line)
      const cleanedLine = cleanReadableBody(line)
      if (cleanedLine) bodyLines.push(...splitLongReadableLine(cleanedLine))
    })

    flush()
  })

  return entries
}

function HighlightedReadableBody({ body, fallbackTimeLabel, term }: { body: string; fallbackTimeLabel: string; term: string }) {
  const entries = buildReadableBbsEntries(body, fallbackTimeLabel, term)
  return (
    <div className="watch-detail-entry-list">
      {entries.length ? entries.map((entry) => (
        <article className="watch-detail-entry" key={entry.id}>
          <header>
            <div>
              <span>名前</span>
              <strong>{renderHighlightedText(entry.nameLabel, term)}</strong>
            </div>
            <div>
              <span>性別</span>
              <strong>{renderHighlightedText(entry.genderLabel, term)}</strong>
            </div>
            <div>
              <span>書き込み時間</span>
              <strong>{entry.timeLabel}</strong>
            </div>
          </header>
          <div>
            <span>書き込み内容</span>
            {entry.lines.map((line, index) => (
              <p key={`${index}-${line.slice(0, 20)}`}>{renderHighlightedText(line, term)}</p>
            ))}
          </div>
        </article>
      )) : <p className="muted-note">一致した投稿者名の書き込みを抽出できませんでした。</p>}
    </div>
  )
}

function WatchedWordsPanel({
  hits,
  bookmarks,
  bookmarkDraft,
  searchTerm,
  selectedStoreId,
  stores,
  enabledTemplateKeys,
  busy,
  onDraftChange,
  onAddBookmark,
  onDeleteBookmark,
  onSearch,
  onClearSearch,
  onStoreChange,
  onToggleTemplate,
  onEnableAllTemplates,
  onDisableAllTemplates,
  onUseBookmark,
}: {
  hits: WatchedWordHit[]
  bookmarks: WordBookmark[]
  bookmarkDraft: string
  searchTerm: string
  selectedStoreId: string
  stores: StoreProfile[]
  enabledTemplateKeys: WatchedTemplateKey[]
  busy: string
  onDraftChange: (value: string) => void
  onAddBookmark: () => void
  onDeleteBookmark: (id: string) => void
  onSearch: () => void
  onClearSearch: () => void
  onStoreChange: (storeId: string) => void
  onToggleTemplate: (key: WatchedTemplateKey) => void
  onEnableAllTemplates: () => void
  onDisableAllTemplates: () => void
  onUseBookmark: (bookmark: WordBookmark) => void
}) {
  const [selectedHit, setSelectedHit] = useState<WatchedWordHit | null>(null)
  useBodyScrollLock(Boolean(selectedHit))
  const selectedStoreName =
    selectedStoreId === 'all'
      ? '全店舗'
      : formatBarName(stores.find((store) => store.id === selectedStoreId)?.name ?? selectedStoreId)
  const hasScopeState = Boolean(searchTerm) || selectedStoreId !== 'all'
  const activeTemplateLabels = watchedTemplateRules
    .filter((rule) => enabledTemplateKeys.includes(rule.key))
    .map((rule) => rule.shortLabel)
  const inactiveTemplateCount = watchedTemplateRules.length - activeTemplateLabels.length
  const activeBookmark = searchTerm
    ? bookmarks.find((bookmark) => normalizeLocalSearchText(bookmark.pattern) === normalizeLocalSearchText(searchTerm))
    : null
  const historyLabel = '直近24時間'
  const resultTitle = searchTerm ? `任意ワード「${searchTerm}」` : 'テンプレート・保存ワード'
  const resultLead = searchTerm
    ? `${historyLabel}の投稿者名・性別表記だけから検索しています。`
    : `${historyLabel}の投稿者名・性別表記だけを監視しています。`

  useEffect(() => {
    if (!selectedHit) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedHit(null)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [selectedHit])

  return (
    <section className="app-card watched-card">
      <div className="section-heading">
        <span>検索</span>
        <h2>注目ワード検索</h2>
        <p>テンプレート監視、保存済みワード、店舗範囲を分けて確認できます。本文ではなく、直近24時間の投稿者名・性別表記だけを見ます。</p>
      </div>

      <div className="watch-filter-panel">
        <div className="watch-filter-block">
          <div className="watch-filter-head">
            <div>
              <span>テンプレート監視</span>
              <strong>{activeTemplateLabels.length}件を適用中</strong>
            </div>
            <div className="watch-filter-actions">
              <button type="button" onClick={onEnableAllTemplates}>
                全て適用
              </button>
              <button type="button" onClick={onDisableAllTemplates}>
                全て外す
              </button>
            </div>
          </div>
          <div className="watch-word-chips" aria-label="テンプレート注目ワード">
            {watchedTemplateRules.map((rule) => {
              const active = enabledTemplateKeys.includes(rule.key)
              return (
                <button
                  aria-pressed={active}
                  className={active ? 'is-active' : 'is-inactive'}
                  key={rule.key}
                  title={active ? `${rule.label}を監視対象から外します` : `${rule.label}を監視対象に戻します`}
                  type="button"
                  onClick={() => onToggleTemplate(rule.key)}
                >
                  <span>{rule.shortLabel}</span>
                  <small>{active ? '外す' : '戻す'}</small>
                </button>
              )
            })}
          </div>
        </div>

        <div className="watch-filter-block compact">
          <label className="watch-store-filter">
            <span>検索範囲</span>
            <select value={selectedStoreId} onChange={(event) => onStoreChange(event.target.value)}>
              <option value="all">全店舗</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {formatBarName(store.name)}
                </option>
              ))}
            </select>
          </label>
        </div>
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
          placeholder="任意ワードを入力…"
          value={bookmarkDraft}
          onChange={(event) => onDraftChange(event.target.value)}
        />
        <button className="secondary-action" type="button" disabled={!bookmarkDraft.trim()} onClick={onSearch}>
          検索
        </button>
        <button type="button" disabled={!bookmarkDraft.trim() || busy === 'word-bookmark'} onClick={onAddBookmark}>
          保存
        </button>
      </form>
      <div className="watch-helper-row">
        <span>検索: 投稿者名だけを確認</span>
        <span>保存: 次回以降も監視</span>
        <span>対象: {historyLabel}</span>
      </div>
      {hasScopeState ? (
        <div className="watch-search-state">
          <span>
            {searchTerm ? `検索中: ${searchTerm}` : 'テンプレート監視'} / {selectedStoreName}
          </span>
          <button
            type="button"
            onClick={() => {
              if (searchTerm) onClearSearch()
              else onStoreChange('all')
            }}
          >
            解除
          </button>
        </div>
      ) : null}
      {bookmarks.length ? (
        <div className="watch-saved-block">
          <div className="watch-filter-head">
            <div>
              <span>保存済みワード</span>
              <strong>{bookmarks.length}件</strong>
            </div>
            {activeBookmark ? <em>「{activeBookmark.label}」で検索中</em> : <em>押すと検索条件になります</em>}
          </div>
          <div className="bookmark-list">
            {bookmarks.slice(0, 12).map((bookmark) => {
              const active = normalizeLocalSearchText(bookmark.pattern) === normalizeLocalSearchText(searchTerm)
              return (
                <article className={active ? 'is-active' : undefined} key={bookmark.id}>
                  <button type="button" onClick={() => onUseBookmark(bookmark)}>
                    {bookmark.label}
                  </button>
                  <button aria-label={`${bookmark.label}を削除`} type="button" onClick={() => onDeleteBookmark(bookmark.id)}>
                    <Trash size={13} weight="bold" />
                  </button>
                </article>
              )
            })}
          </div>
        </div>
      ) : null}

      <div className="watch-result-summary">
        <div>
          <span>表示中</span>
          <strong>{resultTitle}</strong>
          <p>{resultLead}</p>
        </div>
        <div className="watch-applied-tags" aria-label="現在の表示条件">
          <span>{selectedStoreName}</span>
          <span>対象: {historyLabel}</span>
          {searchTerm ? (
            <span>検索語: {searchTerm}</span>
          ) : (
            <>
              <span>テンプレート: {activeTemplateLabels.length ? activeTemplateLabels.join(' / ') : 'なし'}</span>
              <span>保存ワード: {bookmarks.length ? `${bookmarks.length}件` : 'なし'}</span>
              {inactiveTemplateCount ? <span>外した項目: {inactiveTemplateCount}件</span> : null}
            </>
          )}
        </div>
      </div>
      <div className="watch-hit-list" aria-label="一致履歴">
        {hits.length ? (
          hits.map((hit) => (
            <article className={`watch-hit ${hit.severity}`} key={hit.id}>
              <span className="watch-hit-label">{hit.label}</span>
              <strong>{formatBarName(hit.store.name)}</strong>
              <small>{formatMatchSource(hit)} / {formatRadarCapturedAt(hit.post.postedAt)}</small>
              <p className="watch-hit-snippet">{renderHighlightedText(hit.snippet, hit.term)}</p>
              <div className="watch-hit-footer">
                <span>{buildReadableBbsLines(hit.post.body).length}行に整理</span>
                <button type="button" onClick={() => setSelectedHit(hit)}>
                  詳細を見る
                </button>
              </div>
            </article>
          ))
        ) : (
          <p className="muted-note">
            {searchTerm
              ? `「${searchTerm}」は直近24時間の投稿者名・性別表記ではまだ一致していません。表記ゆれを短めの語にすると拾いやすくなります。`
              : bookmarks.length
                ? '直近24時間では保存済みワードの一致はまだありません。ワードを押すとその語で再検索できます。'
                : '検索ワードを入力して保存してください。巡回済みBBSの投稿者名に一致すると、ここに出ます。'}
          </p>
        )}
      </div>
      {selectedHit ? (
        <div className="watch-detail-layer" role="presentation" onClick={() => setSelectedHit(null)}>
          <section
            aria-labelledby="watch-detail-title"
            aria-modal="true"
            className="watch-detail-modal"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="watch-detail-header">
              <div>
                <span>{selectedHit.label}</span>
                <h3 id="watch-detail-title">{formatBarName(selectedHit.store.name)}</h3>
                <p>
                  {formatMatchSource(selectedHit)} / {formatRadarCapturedAt(selectedHit.post.postedAt)}
                </p>
              </div>
              <button aria-label="詳細を閉じる" type="button" onClick={() => setSelectedHit(null)}>
                <X size={18} weight="bold" />
              </button>
            </header>
            <div className="watch-detail-body">
              <HighlightedReadableBody
                body={selectedHit.post.body}
                fallbackTimeLabel={formatRadarCapturedAt(selectedHit.post.postedAt)}
                term={selectedHit.term}
              />
            </div>
          </section>
        </div>
      ) : null}
    </section>
  )
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

function formatUserBbsStatus(status?: string) {
  if (status === 'ok') return '取得成功'
  if (status === 'pending' || !status) return '取得待ち'
  return '取得不可'
}

function formatMatchSource(match: ExactTermMatch | WatchedWordHit) {
  if (match.post.id.startsWith('snapshot-')) return 'スクショ由来'
  if (match.post.source === 'scrape') return 'BBS由来'
  if (match.post.source === 'csv') return '取込データ'
  return '投稿データ'
}

function ExactSearchCard({
  activeFilter,
  busy,
  counts,
  exactTerms,
  isSignedIn,
  matches,
  total,
  onFilterChange,
  onSave,
  onUpdateTerm,
}: {
  activeFilter: ExactMatchFilter
  busy: string
  counts: Record<ExactMatchFilter, number>
  exactTerms: ExactTermState
  isSignedIn: boolean
  matches: ExactTermMatch[]
  total: number
  onFilterChange: (filter: ExactMatchFilter) => void
  onSave: () => void
  onUpdateTerm: (group: ExactTermGroup, value: string) => void
}) {
  return (
    <section className="app-card form-card compact-search-card">
      <FormTitle icon={<MagnifyingGlass size={19} weight="bold" />} title="監視カテゴリ" />
      <p className="form-note">人物名や呼び名をカテゴリ別に監視します。直近24時間の投稿者名・性別表記だけを見て、完全一致した箇所を表示します。</p>
      <div className="term-grid">
        <label>
          <span>人気単独男性を監視</span>
          <input
            autoComplete="off"
            name="popularSingleMale"
            placeholder="例: 人気単男A"
            spellCheck={false}
            value={exactTerms.popularSingleMale}
            onChange={(event) => onUpdateTerm('popularSingleMale', event.target.value)}
          />
        </label>
        <label>
          <span>人気単独女性を監視</span>
          <input
            autoComplete="off"
            name="popularSingleFemale"
            placeholder="例: 人気単女B"
            spellCheck={false}
            value={exactTerms.popularSingleFemale}
            onChange={(event) => onUpdateTerm('popularSingleFemale', event.target.value)}
          />
        </label>
        <label>
          <span>不人気・苦手を監視</span>
          <input
            autoComplete="off"
            name="negativePerson"
            placeholder="例: 苦手さんC"
            spellCheck={false}
            value={exactTerms.negativePerson}
            onChange={(event) => onUpdateTerm('negativePerson', event.target.value)}
          />
        </label>
      </div>
      <button type="button" onClick={onSave} disabled={!isSignedIn || busy === 'exact'}>
        <MagnifyingGlass size={17} weight="bold" />
        {isSignedIn ? '監視ワードを保存して検索' : 'ログイン後に保存'}
      </button>
      <ExactMatchList
        activeFilter={activeFilter}
        counts={counts}
        matches={matches}
        total={total}
        onFilterChange={onFilterChange}
      />
    </section>
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
    { key: 'popularSingleMale', label: '男性監視' },
    { key: 'popularSingleFemale', label: '女性監視' },
    { key: 'negativePerson', label: '苦手監視' },
  ]
  const [selectedMatch, setSelectedMatch] = useState<ExactTermMatch | null>(null)
  useBodyScrollLock(Boolean(selectedMatch))

  useEffect(() => {
    if (!selectedMatch) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedMatch(null)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [selectedMatch])

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
          <span>{total ? 'このカテゴリの一致はありません。' : '監視ワードの一致はまだありません。'}</span>
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
            <small className="match-source">
              {formatMatchSource(match)} / {formatRadarCapturedAt(match.post.postedAt)}
            </small>
            <p>
              {formatBarName(match.store.name)} / {renderHighlightedText(match.snippet, match.term)}
            </p>
            <footer className="match-card-footer">
              <span>一致した投稿者の書き込みを確認</span>
              <button type="button" onClick={() => setSelectedMatch(match)}>
                詳細を見る
              </button>
            </footer>
          </article>
        ))}
      </div>
      {selectedMatch ? (
        <div className="watch-detail-layer" role="presentation" onClick={() => setSelectedMatch(null)}>
          <section
            aria-labelledby="exact-detail-title"
            aria-modal="true"
            className="watch-detail-modal"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="watch-detail-header">
              <div>
                <span>{selectedMatch.groupLabel}</span>
                <h3 id="exact-detail-title">{formatBarName(selectedMatch.store.name)}</h3>
                <p>
                  {formatMatchSource(selectedMatch)} / {formatRadarCapturedAt(selectedMatch.post.postedAt)}
                </p>
              </div>
              <button aria-label="詳細を閉じる" type="button" onClick={() => setSelectedMatch(null)}>
                <X size={18} weight="bold" />
              </button>
            </header>
            <div className="watch-detail-body">
              <HighlightedReadableBody
                body={selectedMatch.post.body}
                fallbackTimeLabel={formatRadarCapturedAt(selectedMatch.post.postedAt)}
                term={selectedMatch.term}
              />
            </div>
          </section>
        </div>
      ) : null}
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
