'use client'

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
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
  buildVisitForecasts,
  buildWatchedWordHits,
  defaultWatchedTemplateKeys,
  extractWatchedAuthorEntries,
  extractWatchedAuthorText,
  filterPostsWithinHours,
  normalizeWatchedSearchText,
  parseExactTerms,
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
  VisitForecast,
  WatchedWordHit,
  WordBookmark,
} from '@/lib/types'
import './night-radar-console.css'

type ApiState = { tone: 'idle' | 'good' | 'warn'; message: string }
type ViewKey = 'radar' | 'analytics' | 'capture' | 'automate' | 'account'
type NavKey = 'today' | 'search' | 'calendar' | 'stores' | 'settings'
type ExactMatchFilter = ExactTermGroup | 'all'
type StoreSortKey = 'hot' | 'share' | 'signals' | 'updated'
type StoreSessionFilter = 'all' | 'day' | 'night'
type StoreSignalFilter = 'all' | 'female' | 'first' | 'group' | 'emoji'
type SourceHealth = { ok: number; blocked: number; failed: number; pending: number; total: number }
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
  { key: 'search', view: 'automate', label: '検索', icon: <MagnifyingGlass size={20} weight="bold" /> },
  { key: 'calendar', view: 'analytics', label: 'カレンダー', icon: <CalendarDots size={20} weight="bold" />, targetId: 'top-calendar' },
  { key: 'stores', view: 'capture', label: '店舗', icon: <Storefront size={20} weight="bold" /> },
  { key: 'settings', view: 'account', label: '設定', icon: <ShieldCheck size={20} weight="bold" /> },
]

const navScreenCopy: Record<NavKey, { title: string; body: string }> = {
  today: { title: '今日', body: '結論、盛り上がり、月間イベント、注目ワードだけを先に見ます。' },
  search: { title: '検索', body: '登録ワードと監視カテゴリで、全店BBSの一致箇所を確認します。' },
  calendar: { title: 'カレンダー', body: '月間イベントを日付単位で確認します。日別詳細は開いた時だけ表示します。' },
  stores: { title: '店舗', body: '候補店舗を盛り上がり順に比較し、気になる店舗だけ残します。' },
  settings: { title: '設定', body: 'ログイン状態、店舗マスタ、公開情報の扱いを確認します。' },
}

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
      if (status === 'ok') health.ok += 1
      else if (status === 'blocked') health.blocked += 1
      else if (status === 'failed') health.failed += 1
      else health.pending += 1
      health.total += 1
      return health
    },
    { ok: 0, blocked: 0, failed: 0, pending: 0, total: 0 },
  )
}

function sourceHealthLabel(health: SourceHealth) {
  if (!health.total) return '取得待ち'
  const trouble = health.blocked + health.failed
  if (!trouble && health.ok === health.total) return '取得済み'
  if (health.ok > 0) return '一部未取得'
  return '未取得'
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
  const isSignedIn = Boolean(initialState.userEmail)
  const storeDecisionStorageKey = `night-radar-store-decisions:${initialState.userEmail ?? 'anonymous'}`
  const firstGuideStorageKey = `night-radar-first-guide:${initialState.userEmail ?? 'anonymous'}`
  const watchedTemplateStorageKey = `night-radar-watched-templates:${initialState.userEmail ?? 'anonymous'}`
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
  const reduceMotion = useReducedMotion()

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

  const summary = useMemo(() => summarizeSignals(scoredEvents), [scoredEvents])
  const storeAnalytics = useMemo(() => buildStoreBbsAnalytics(stores, posts), [stores, posts])
  const storeRadar = useMemo(() => buildStoreRadarPoints(stores, posts, bbsSnapshots), [stores, posts, bbsSnapshots])
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
  const eventCountByStoreId = useMemo(() => {
    const map = new Map<string, number>()
    calendarEvents.forEach((event) => map.set(event.storeId, (map.get(event.storeId) ?? 0) + 1))
    return map
  }, [calendarEvents])
  const filteredStoreRadar = useMemo(() => {
    const query = normalizeLocalSearchText(storeQuery)
    const filtered = storeRadar.filter((point) => {
      if (storeDecisions[point.store.id] === 'hidden') return false

      if (query) {
        const haystack = normalizeLocalSearchText(
          [point.store.name, point.store.area, point.store.prStructure, point.verdict].join(' '),
        )
        if (!haystack.includes(query)) return false
      }

      if (storeSessionFilter === 'day' && !point.store.hasDaytime) return false
      if (storeSessionFilter === 'night' && !point.store.hasNight) return false

      if (storeSignalFilter === 'female' && point.signals.femaleOnly < 1) return false
      if (storeSignalFilter === 'first' && point.signals.firstVisit < 1) return false
      if (storeSignalFilter === 'group' && point.signals.groupVisit < 1) return false
      if (storeSignalFilter === 'emoji' && point.signals.emoji < 1) return false

      return true
    })

    return filtered.toSorted((a, b) => {
      if (storeSort === 'share') return b.share - a.share || b.score - a.score
      if (storeSort === 'signals') return b.signals.totalSignals - a.signals.totalSignals || b.score - a.score
      if (storeSort === 'updated') {
        const bTime = b.lastCapturedAt ? new Date(b.lastCapturedAt).getTime() : 0
        const aTime = a.lastCapturedAt ? new Date(a.lastCapturedAt).getTime() : 0
        return bTime - aTime || b.score - a.score
      }
      return b.score - a.score || b.share - a.share
    })
  }, [storeDecisions, storeQuery, storeRadar, storeSessionFilter, storeSignalFilter, storeSort])
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
    () => buildGenderPostRankings(searchableBbsRecords, stores),
    [searchableBbsRecords, stores],
  )
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
  const visitForecasts = useMemo(() => buildVisitForecasts(events, stores, posts, { windowDays: 14 }), [events, stores, posts])
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
  const featuredEvent = summary.dayTop ?? summary.nightTop ?? scoredEvents[0]
  const visibleMatches = filteredExactMatches.slice(0, 16)
  const currentPlan = subscription.plan
  const currentLimits = planLimits[currentPlan]
  const activeWatchedHits = watchSearchTerm.trim() ? searchedWatchedWordHits : watchedWordHits
  const visibleWatchedHits = dedupeWatchedHitsByStore(activeWatchedHits).slice(0, 8)
  const topForecasts = visitForecasts.slice(0, 3)
  const latestPost = posts[0]
  const hotStore = storeRadar[0]
  const watchStore = storeRadar.find((point) => point.rank > 1 && point.score >= 35) ?? storeRadar[1]
  const sourceHealth = useMemo(() => buildSourceHealth(bbsSources), [bbsSources])
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
  const candidateStoreCount = Object.values(storeDecisions).filter((state) => state === 'candidate').length
  const favoriteStoreCount = Object.values(storeDecisions).filter((state) => state === 'favorite').length
  const hiddenStoreCount = Object.values(storeDecisions).filter((state) => state === 'hidden').length
  const activeNavItem = navItems.find((item) => item.key === activeNav) ?? navItems[0]

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

  function openTopCalendar() {
    setActiveNav('calendar')
    setView('analytics')
    window.setTimeout(() => {
      document.getElementById('top-calendar')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 0)
  }

  function closeFirstGuide() {
    window.localStorage.setItem(firstGuideStorageKey, 'seen')
    setShowFirstGuide(false)
  }

  function runFirstGuideAction(target: NavKey) {
    closeFirstGuide()
    const item = navItems.find((navItem) => navItem.key === target) ?? navItems[0]
    navigateTo(item)
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
              <motion.button
                aria-pressed={isActive}
                className={isActive ? 'is-active' : ''}
                key={item.key}
                type="button"
                onClick={() => navigateTo(item)}
                whileHover={reduceMotion ? undefined : { y: -1 }}
                whileTap={reduceMotion ? undefined : { scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              >
                <span className="nav-icon-shell">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
              </motion.button>
            )
          })}
        </nav>

        <ScreenContext item={activeNavItem} />

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
                label="店舗"
                onClick={() => {
                  setActiveNav('stores')
                  setView('capture')
                }}
              />
              <ActionButton
                icon={<MagnifyingGlass size={20} weight="bold" />}
                label="検索"
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
              onOpenForecast={() => {
                setActiveNav('stores')
                setView('capture')
              }}
              onRunScoring={runScoring}
              sourceHealth={sourceHealth}
              topForecast={topForecasts[0]}
              watchStore={watchStore}
              busy={busy}
            />

            <StoreMomentumRanking points={storeRadar} />

            <MonthlyCalendarPreview events={calendarEvents} stores={stores} />

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
          </section>
        )}

        {view === 'capture' && (
          <section className="view-stack">
            <ViewIntro eyebrow="店舗" title="盛り上がり順に店舗を見る" body="BBS、月間イベント、注目シグナルをまとめて、候補店舗だけを見比べます。" />

            <StoreDiscoveryPanel
              allPoints={storeRadar}
              analyticsByStoreId={storeAnalyticsById}
              candidateCount={candidateStoreCount}
              eventCountByStoreId={eventCountByStoreId}
              favoriteCount={favoriteStoreCount}
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

            <PostCountRankingCard rankings={genderPostRankings.slice(0, 6)} />

            <GenderWordRatioRankingCard rankings={genderPostRankings} />
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
                        {resolveStoreDisplayName(stores, event.storeId)} / {formatEventDateLabel(event)} {event.startsAt}
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
            {selectedStorePoint ? (
              <StoreDetailDrawer
                analytics={selectedStoreAnalytics}
                decision={storeDecisions[selectedStorePoint.store.id]}
                eventCount={selectedStoreEventCount}
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
            <ViewIntro eyebrow="検索" title="掲示板から気になる名前を探す" body="保存した注目ワードと完全一致条件を使って、直近24時間の投稿者名・性別表記を確認します。" />

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
                <span>{initialState.userEmail ? initialState.userEmail : '未ログイン'}</span>
                <strong>{isSignedIn ? 'ログイン中' : 'ログイン待ち'}</strong>
              </div>
              {isSignedIn ? (
                <div className="signed-in-panel">
                  <p>ログイン済みのため、追加のログインボタンは停止しています。別アカウントで入り直す場合はログアウトしてください。</p>
                </div>
              ) : (
                <a className="secondary-action" href="/login">
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

        {busy ? <BusyOverlay label={loadingLabelForBusy(busy)} reduceMotion={Boolean(reduceMotion)} /> : null}
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

function BusyOverlay({ label, reduceMotion }: { label: string; reduceMotion: boolean }) {
  useEffect(() => {
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [])

  return (
    <motion.div
      aria-live="polite"
      className="busy-overlay"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={reduceMotion ? undefined : { opacity: 1 }}
      exit={reduceMotion ? undefined : { opacity: 0 }}
      role="status"
      transition={{ duration: 0.18, ease: 'easeOut' }}
    >
      <div className="busy-loader" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <p>{label}</p>
      <small>完了するまでこの画面でお待ちください</small>
    </motion.div>
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
        <p>迷ったら今日の結論、気になる名前があるなら検索、通いたい店があるなら店舗整理から始めます。</p>
      </div>
      <div className="first-run-actions">
        <button type="button" onClick={onOpenToday}>
          今日の候補を見る
        </button>
        <button type="button" onClick={onOpenSearch}>
          注目ワードを登録
        </button>
        <button type="button" onClick={onOpenStores}>
          店舗をお気に入りにする
        </button>
      </div>
      <button className="first-run-close" type="button" onClick={onClose}>
        閉じる
      </button>
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
  featuredEvent,
  topForecast,
  latestCaptureLabel,
  sourceHealth,
  busy,
  onRunScoring,
  onOpenForecast,
}: {
  hotStore?: StoreRadarPoint
  watchStore?: StoreRadarPoint
  featuredEvent?: ScoredEvent
  topForecast?: VisitForecast
  latestCaptureLabel: string
  sourceHealth: SourceHealth
  busy: string
  onRunScoring: () => void
  onOpenForecast: () => void
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
  const reasonChips = buildReasonChips(hotStore)

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
        <div>
          <dt>取得</dt>
          <dd>{formatSourceSummary(sourceHealth, latestCaptureLabel)}</dd>
        </div>
      </dl>
      <div className="reason-chip-row" aria-label="スコア内訳">
        {reasonChips.map((chip) => (
          <span key={chip}>{chip}</span>
        ))}
      </div>
      <div className="decision-actions">
        <button type="button" onClick={onRunScoring} disabled={busy === 'score'}>
          <ChartLineUp size={17} weight="bold" />
          再計算
        </button>
        <button type="button" onClick={onOpenForecast}>
          店舗を比較
        </button>
        <a href="#top-calendar">
          月間イベント
        </a>
      </div>
    </section>
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

function buildReasonChips(point?: StoreRadarPoint) {
  if (!point) return ['巡回待ち']

  const chips = [
    point.postCount ? `投稿 +${point.postCount}` : '',
    point.signals.femaleOnly ? `女性ワード +${point.signals.femaleOnly}` : '',
    point.signals.firstVisit ? `初回ワード +${point.signals.firstVisit}` : '',
    point.signals.groupVisit ? `複数 +${point.signals.groupVisit}` : '',
    point.snapshotCount ? `スクショ +${point.snapshotCount}` : '',
  ].filter(Boolean)

  return chips.length ? chips.slice(0, 4) : ['根拠蓄積中']
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

function StoreMomentumRanking({ points }: { points: StoreRadarPoint[] }) {
  const rankedPoints = points.slice(0, 5)
  const strongest = rankedPoints[0]
  const followingPoints = rankedPoints.slice(1)

  return (
    <section className="momentum-ranking-card" aria-label="お店の盛り上がりランキング">
      <div className="momentum-ranking-head">
        <div>
          <span>盛り上がりランキング</span>
          <h2>今夜、反応が濃いお店</h2>
          <p>直近の巡回、投稿者名の注目語、イベント量から、まず見たい候補を浮かび上がらせます。</p>
        </div>
        <strong>{strongest ? `${strongest.share}%` : '--'}</strong>
      </div>

      {rankedPoints.length ? (
        <>
          {strongest ? (
            <article className={`momentum-leader-card ${strongest.tone}`}>
              <div className="momentum-leader-rank">
                <span>本命</span>
                <strong>#1</strong>
              </div>
              <div className="momentum-leader-main">
                <div>
                  <h3>{formatBarName(strongest.store.name)}</h3>
                  <p>{strongest.verdict} / {formatRadarCapturedAt(strongest.lastCapturedAt)}</p>
                </div>
                <div className="reason-chip-row compact" aria-label={`${formatBarName(strongest.store.name)}の根拠`}>
                  {buildReasonChips(strongest).map((chip) => (
                    <span key={chip}>{chip}</span>
                  ))}
                </div>
                <div className="momentum-leader-meter" aria-hidden="true">
                  <i style={{ inlineSize: `${Math.max(5, Math.min(100, strongest.score))}%` }} />
                </div>
              </div>
              <dl className="momentum-leader-score">
                <div>
                  <dt>熱量</dt>
                  <dd>{strongest.score}<small>点</small></dd>
                </div>
                <div>
                  <dt>比率</dt>
                  <dd>{strongest.share}<small>%</small></dd>
                </div>
              </dl>
            </article>
          ) : null}

          <div className="momentum-ranking-list">
            {followingPoints.map((point) => {
              const storeName = formatBarName(point.store.name)
              const reasonChips = buildReasonChips(point)

              return (
                <article className={`momentum-ranking-row ${point.tone}`} key={point.store.id}>
                  <span className="momentum-rank">{point.rank}</span>
                  <div className="momentum-store">
                    <div className="momentum-store-title">
                      <strong>{storeName}</strong>
                      <em>{point.score}点</em>
                    </div>
                    <div className="momentum-meter" aria-hidden="true">
                      <i style={{ inlineSize: `${Math.max(5, Math.min(100, point.score))}%` }} />
                    </div>
                    <p>{point.verdict}</p>
                    <div className="reason-chip-row compact" aria-label={`${storeName}の根拠`}>
                      {reasonChips.map((chip) => (
                        <span key={chip}>{chip}</span>
                      ))}
                    </div>
                  </div>
                  <dl className="momentum-meta">
                    <div>
                      <dt>比率</dt>
                      <dd>{point.share}%</dd>
                    </div>
                    <div>
                      <dt>注目</dt>
                      <dd>{point.signals.totalSignals}</dd>
                    </div>
                    <div>
                      <dt>更新</dt>
                      <dd>{formatRadarCapturedAt(point.lastCapturedAt)}</dd>
                    </div>
                  </dl>
                </article>
              )
            })}
          </div>
        </>
      ) : (
        <p className="muted-note">BBS巡回後に表示します。先に注目ワードを登録しておくと、一致履歴も同時に確認できます。</p>
      )}
    </section>
  )
}

const femaleGenderPattern = /(女性|女の子|女子|単女|単独女性|主婦|人妻|奥様|女性予約|女性来店|女性無料|女性一人)/g
const maleGenderPattern = /(男性|男の子|男子|単男|単独男性|男性予約|男性来店|男性一人|紳士|旦那)/g
const postMarkerPattern = /(20\d{2}年\d{1,2}月\d{1,2}日|\d{4}[-/]\d{1,2}[-/]\d{1,2}|投稿者|書き込み|来店予告|No\.\d+)/g
const postNumberPattern = /(?:記事番号[:：]?\s*|No[.\s]*)(\d{3,})/gi

function countGenderSignals(text: string, pattern: RegExp) {
  return text.match(pattern)?.length ?? 0
}

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
      const body = storeRecords.map((record) => record.body).join('\n')
      const femaleSignals = countGenderSignals(body, femaleGenderPattern)
      const maleSignals = countGenderSignals(body, maleGenderPattern)
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
    .toSorted((a, b) => b.observedCount - a.observedCount || b.signalTotal - a.signalTotal || b.femaleRatio - a.femaleRatio)
    .map((ranking, index) => ({ ...ranking, rank: index + 1 }))
}

function PostCountRankingCard({ rankings }: { rankings: GenderPostRanking[] }) {
  const visibleRankings = rankings.filter((ranking) => ranking.observedCount > 0).slice(0, 6)

  return (
    <section className="gender-ranking-card" aria-label="観測投稿量ランキング">
      <div className="gender-ranking-head">
        <div>
          <span>観測投稿</span>
          <h2>反応が多い店舗</h2>
          <p>記事番号・投稿者断片を重複除外して並べます。実人数や公式の投稿総数ではありません。</p>
        </div>
        <strong>{visibleRankings[0] ? `${visibleRankings[0].observedCount}件` : '--'}</strong>
      </div>

      <div className="gender-ranking-list">
        {visibleRankings.length ? (
          visibleRankings.map((ranking) => (
            <article className="gender-ranking-row" key={ranking.store.id}>
              <span className="gender-rank">{ranking.rank}</span>
              <div className="gender-store">
                <div className="gender-store-title">
                  <strong>{formatBarName(ranking.store.name)}</strong>
                  <em>{ranking.observedCount}件</em>
                </div>
                <div className="gender-ratio-bar" aria-label={`女性 ${ranking.femaleRatio}% 男性 ${ranking.maleRatio}%`}>
                  <i style={{ inlineSize: `${ranking.femaleRatio}%` }} />
                </div>
                <p>
                  女性ワード {ranking.femaleSignals} / 男性ワード {ranking.maleSignals} ・ 巡回断片 {ranking.recordCount}件
                </p>
              </div>
              <dl className="gender-meta">
                <div>
                  <dt>女性語</dt>
                  <dd>{ranking.femaleSignals}</dd>
                </div>
                <div>
                  <dt>男性語</dt>
                  <dd>{ranking.maleSignals}</dd>
                </div>
              </dl>
            </article>
          ))
        ) : (
          <p className="muted-note">BBS巡回または投稿取り込みが入ると、観測投稿量を表示します。</p>
        )}
      </div>
    </section>
  )
}

function GenderWordRatioRankingCard({ rankings }: { rankings: GenderPostRanking[] }) {
  const visibleRankings = rankings
    .filter((ranking) => ranking.signalTotal > 0)
    .toSorted((a, b) => b.signalTotal - a.signalTotal || b.femaleRatio - a.femaleRatio)
    .slice(0, 6)

  return (
    <section className="gender-ranking-card" aria-label="女性ワード比率と男性ワード比率">
      <div className="gender-ranking-head">
        <div>
          <span>ワード比率</span>
          <h2>女性ワード比率・男性ワード比率</h2>
          <p>実人数ではなく、投稿文に出てくる女性系/男性系ワードの比率です。</p>
        </div>
        <strong>{visibleRankings[0] ? `${visibleRankings[0].femaleRatio}%` : '--'}</strong>
      </div>

      <div className="gender-ranking-list">
        {visibleRankings.length ? (
          visibleRankings.map((ranking, index) => (
            <article className="gender-ranking-row" key={ranking.store.id}>
              <span className="gender-rank">{index + 1}</span>
              <div className="gender-store">
                <div className="gender-store-title">
                  <strong>{formatBarName(ranking.store.name)}</strong>
                  <em>{ranking.signalTotal}語</em>
                </div>
                <div className="gender-ratio-bar" aria-label={`女性ワード ${ranking.femaleRatio}% 男性ワード ${ranking.maleRatio}%`}>
                  <i style={{ inlineSize: `${ranking.femaleRatio}%` }} />
                </div>
                <p>
                  女性ワード {ranking.femaleRatio}% / 男性ワード {ranking.maleRatio}% ・ {ranking.verdict}
                </p>
              </div>
              <dl className="gender-meta">
                <div>
                  <dt>女性語</dt>
                  <dd>{ranking.femaleSignals}</dd>
                </div>
                <div>
                  <dt>男性語</dt>
                  <dd>{ranking.maleSignals}</dd>
                </div>
              </dl>
            </article>
          ))
        ) : (
          <p className="muted-note">女性系/男性系ワードが検出されると比率を表示します。</p>
        )}
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
  const strongest = points[0]
  const candidatePoints = allPoints.filter((point) => storeDecisions[point.store.id] === 'candidate').slice(0, 4)
  const sortLabel =
    sort === 'share' ? '比率が高い順' : sort === 'signals' ? '根拠が多い順' : sort === 'updated' ? '更新が新しい順' : '盛り上がり順'
  const sessionLabel = sessionFilter === 'day' ? '昼あり' : sessionFilter === 'night' ? '夜あり' : '全時間'
  const signalLabel =
    signalFilter === 'female' ? '女性' : signalFilter === 'first' ? '初回' : signalFilter === 'group' ? '複数' : signalFilter === 'emoji' ? '絵文字' : '全根拠'

  return (
    <section className="store-discovery-card" aria-label="店舗探索">
      <div className="store-discovery-head">
        <div>
          <span>店舗を探す</span>
          <h2>盛り上がりと根拠で比較</h2>
          <p>一覧ではなく、今日見る価値があるお店だけを絞り込みます。</p>
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
          <option value="hot">盛り上がり順</option>
          <option value="share">比率が高い順</option>
          <option value="signals">根拠が多い順</option>
          <option value="updated">更新が新しい順</option>
        </select>
      </div>

      <div className="store-filter-row" aria-label="店舗フィルタ">
        <button type="button" aria-pressed={sessionFilter === 'all'} onClick={() => onSessionFilterChange('all')}>
          全時間
        </button>
        <button type="button" aria-pressed={sessionFilter === 'day'} onClick={() => onSessionFilterChange('day')}>
          昼あり
        </button>
        <button type="button" aria-pressed={sessionFilter === 'night'} onClick={() => onSessionFilterChange('night')}>
          夜あり
        </button>
        <button type="button" aria-pressed={signalFilter === 'all'} onClick={() => onSignalFilterChange('all')}>
          全根拠
        </button>
        <button type="button" aria-pressed={signalFilter === 'female'} onClick={() => onSignalFilterChange('female')}>
          女性
        </button>
        <button type="button" aria-pressed={signalFilter === 'first'} onClick={() => onSignalFilterChange('first')}>
          初回
        </button>
        <button type="button" aria-pressed={signalFilter === 'group'} onClick={() => onSignalFilterChange('group')}>
          複数
        </button>
        <button type="button" aria-pressed={signalFilter === 'emoji'} onClick={() => onSignalFilterChange('emoji')}>
          絵文字
        </button>
      </div>

      <div className="store-filter-status" aria-live="polite">
        <span>
          表示 {points.length}/{totalCount}
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

      <div className="store-explorer-grid">
        {visibleTop.length ? (
          visibleTop.map((point) => (
            <StoreExplorerCard
              analytics={analyticsByStoreId.get(point.store.id)}
              decision={storeDecisions[point.store.id]}
              eventCount={eventCountByStoreId.get(point.store.id) ?? 0}
              key={point.store.id}
              point={point}
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

function StoreExplorerCard({
  analytics,
  decision,
  eventCount,
  point,
  source,
  onDecisionChange,
  onOpenDetail,
}: {
  analytics?: StoreBbsAnalytics
  decision?: StoreDecisionState
  eventCount: number
  point: StoreRadarPoint
  source?: BbsSource
  onDecisionChange: (storeId: string, state: StoreDecisionState) => void
  onOpenDetail: (storeId: string) => void
}) {
  const signalItems = [
    { label: '女性', value: point.signals.femaleOnly },
    { label: '初回', value: point.signals.firstVisit },
    { label: '複数', value: point.signals.groupVisit },
    { label: '絵文字', value: point.signals.emoji },
  ]
  const sourceStatus = formatUserBbsStatus(source?.lastStatus)
  const reasonChips = buildReasonChips(point)
  const todayFit = todayCompatibilityLabel(analytics)
  const decisionLabel =
    decision === 'candidate' ? '候補' : decision === 'favorite' ? 'お気に入り' : decision === 'hidden' ? '非表示' : '比較中'

  return (
    <article className={`store-explorer-card is-${point.tone} ${decision ? `decision-${decision}` : ''}`}>
      <div className="store-rank-line">
        <span className="store-rank-badge">#{point.rank}</span>
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

      <div className="store-signal-grid">
        {signalItems.map((item) => (
          <span key={item.label} className={item.value ? 'is-detected' : ''}>
            {item.label}
            <em>{item.value}</em>
          </span>
        ))}
      </div>

      <dl className="store-card-facts">
        <div>
          <dt>比率</dt>
          <dd>{point.share}%</dd>
        </div>
        <div>
          <dt>投稿</dt>
          <dd>{point.postCount}</dd>
        </div>
        <div>
          <dt>予定</dt>
          <dd>{eventCount}</dd>
        </div>
        <div>
          <dt>巡回</dt>
          <dd>{sourceStatus}</dd>
        </div>
      </dl>

      <div className="store-card-note">
        <span>{todayFit}</span>
        <em>{formatRadarCapturedAt(point.lastCapturedAt)}</em>
      </div>

      <div className="reason-chip-row compact" aria-label={`${formatBarName(point.store.name)}の短い根拠`}>
        {reasonChips.map((chip) => (
          <span key={chip}>{chip}</span>
        ))}
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
          詳細
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

function StoreDetailDrawer({
  analytics,
  decision,
  eventCount,
  point,
  source,
  onClose,
  onDecisionChange,
}: {
  analytics?: StoreBbsAnalytics
  decision?: StoreDecisionState
  eventCount: number
  point: StoreRadarPoint
  source?: BbsSource
  onClose: () => void
  onDecisionChange: (storeId: string, state: StoreDecisionState) => void
}) {
  const signalReasons = [
    point.signals.femaleOnly ? `女性関連 ${point.signals.femaleOnly}件` : '',
    point.signals.firstVisit ? `初回系 ${point.signals.firstVisit}件` : '',
    point.signals.comeback ? `久しぶり系 ${point.signals.comeback}件` : '',
    point.signals.groupVisit ? `複数来店 ${point.signals.groupVisit}件` : '',
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
          <span>店舗詳細</span>
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

        <dl className="store-detail-metrics">
          <div>
            <dt>掲示板投稿</dt>
            <dd>{point.postCount}件</dd>
          </div>
          <div>
            <dt>スクショ</dt>
            <dd>{point.snapshotCount}件</dd>
          </div>
          <div>
            <dt>イベント</dt>
            <dd>{eventCount}件</dd>
          </div>
          <div>
            <dt>今日との相性</dt>
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
            <p>巡回データが増えると、注目根拠がここにまとまります。</p>
          )}
        </section>

        <section className="store-detail-section">
          <span>運用メモ</span>
          <p>{analytics?.verdict ? `${todayFit}。${analytics.verdict}` : 'BBS投稿とスクリーンショットを蓄積中です。'}</p>
          <small>最終更新: {formatRadarCapturedAt(point.lastCapturedAt)} / BBS: {formatUserBbsStatus(source?.lastStatus)}</small>
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

function MonthlyCalendarPreview({ events, stores }: { events: EventInput[]; stores: StoreProfile[] }) {
  const monthOptions = useMemo(() => buildCalendarMonthOptions(events), [events])
  const defaultMonthKey = useMemo(() => selectDefaultCalendarMonth(monthOptions), [monthOptions])
  const [selectedMonthKey, setSelectedMonthKey] = useState(defaultMonthKey)
  const activeMonthKey = monthOptions.some((month) => month.key === selectedMonthKey) ? selectedMonthKey : defaultMonthKey
  const activeMonth = monthOptions.find((month) => month.key === activeMonthKey)
  const cells = useMemo(() => buildCalendarPreviewCells(events, stores, activeMonthKey), [activeMonthKey, events, stores])
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
          <strong>{activeMonth?.displayLabel ?? '未設定'}</strong>
        </div>
        <em>{eventCount}件</em>
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
          const visibleStoreNames = [...new Set(cell.items.map((item) => item.storeName))].slice(0, 2)
          const extraCount = Math.max(0, cell.items.length - visibleStoreNames.length)

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
                    {visibleStoreNames.map((storeName, index) => (
                      <span className={`event-color-${index % 3}`} key={`${cell.key}-${storeName}`}>
                        {storeName}
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
      <p>{eventCount ? `${activeMonth?.label ?? '選択月'}の公式イベントを日付別に確認できます。` : 'イベント登録後に月間予定が出ます。先に店舗ページで候補店を整理できます。'}</p>
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

type CalendarMonthOption = {
  key: string
  label: string
  shortLabel: string
  displayLabel: string
  eventCount: number
}

const calendarMonthFormatter = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long' })

function eventMonthKey(event: EventInput) {
  return /^\d{4}-\d{2}-\d{2}$/.test(event.date) ? event.date.slice(0, 7) : monthKeyInJapan()
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

function buildCalendarPreviewCells(events: EventInput[], stores: StoreProfile[], monthKey: string): CalendarPreviewCell[] {
  const [year, month] = monthKey.split('-').map(Number)
  const daysInMonth = daysInMonthInJapan(year, month)
  const firstDay = weekdayIndexForJapanDate(year, month, 1)
  const leadingBlanks = (firstDay + 6) % 7
  const [todayYear, todayMonth, todayDayValue] = dateKeyInJapan().split('-').map(Number)
  const todayDay = todayYear === year && todayMonth === month ? todayDayValue : 0
  const eventDays = new Map<number, CalendarPreviewItem[]>()

  for (const event of events) {
    const day = resolveEventDay(event, year, month)
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
  if (status === 'ok') return '取得済み'
  if (status === 'pending' || !status) return '取得待ち'
  return '一部未取得'
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
