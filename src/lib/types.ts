export const planKeys = ['free', 'light', 'standard', 'premium'] as const

export type PlanKey = (typeof planKeys)[number]
export type SessionKind = 'day' | 'night'
export type SignalTone = 'hot' | 'warm' | 'quiet'
export type NotificationChannel = 'in_app' | 'email' | 'webhook'
export type SituationStatus = 'open' | 'event' | 'crowded' | 'watch' | 'closed'
export type ExactTermGroup = 'popularSingleMale' | 'popularSingleFemale' | 'negativePerson'
export type RuntimeMode = 'database' | 'anonymous' | 'demo'
export type CrawlStatus = 'ok' | 'blocked' | 'failed' | 'pending'
export type BbsParserType = 'auto' | 'body'
export type WordBookmarkMatchType = 'exact' | 'regex' | 'emoji'
export type SetupStatusTone = 'ready' | 'action' | 'check' | 'off'

export type StoreProfile = {
  id: string
  name: string
  area: string
  hasDaytime: boolean
  hasNight: boolean
  openingHourDay: string
  openingHourNight: string
  prStructure: string
  strongDays: string[]
  strongEvents: string[]
  weakEvents: string[]
  trustSeed: number
}

export type EventInput = {
  id: string
  storeId: string
  date: string
  weekday: string
  startsAt: string
  session: SessionKind
  category: string
  title: string
  details?: string
  sourceUrl?: string
}

export type PostRecord = {
  id: string
  storeId: string
  source: 'manual' | 'csv' | 'scrape' | 'ai'
  sourceUrl?: string
  postedAt: string
  body: string
  keywords: string[]
}

export type StoreSituation = {
  id: string
  storeId: string
  status: SituationStatus
  title: string
  note: string
  sourceUrl?: string
  observedAt: string
}

export type StoreDecisionState = 'candidate' | 'favorite' | 'watch' | 'hidden'

export type BbsSource = {
  id: string
  storeId: string
  label: string
  url: string
  parserType: BbsParserType
  active: boolean
  crawlIntervalMinutes: number
  lastFetchedAt?: string
  lastStatus?: CrawlStatus
  lastMessage?: string
}

export type CrawlRun = {
  id: string
  sourceId?: string
  storeId: string
  url: string
  status: CrawlStatus
  message?: string
  fetchedAt: string
  postId?: string
}

export type BbsSnapshotMetrics = {
  femaleOnly: number
  firstVisit: number
  comeback: number
  groupVisit: number
  emoji: number
  totalSignals: number
  textLength: number
}

export type BbsSnapshot = {
  id: string
  sourceId?: string
  storeId: string
  url: string
  screenshotDataUrl?: string
  extractedText: string
  metrics: BbsSnapshotMetrics
  radarScore: number
  capturedAt: string
}

export type StoreRadarPoint = {
  store: StoreProfile
  score: number
  tone: SignalTone
  share: number
  rank: number
  postCount: number
  snapshotCount: number
  lastCapturedAt?: string
  signals: BbsSnapshotMetrics
  verdict: string
}

export type WatchedWordHit = {
  id: string
  label: string
  term: string
  store: StoreProfile
  post: PostRecord
  snippet: string
  severity: 'high' | 'medium' | 'low'
}

export type WordBookmark = {
  id: string
  label: string
  pattern: string
  matchType: WordBookmarkMatchType
  createdAt: string
}

export type VisitForecast = {
  id: string
  store: StoreProfile
  event?: EventInput
  score: number
  rank: number
  dateLabel: string
  timeLabel: string
  reasons: string[]
  watchedSignalCount: number
}

export type WordCategory = {
  id: string
  label: string
  examples: string[]
  tier: PlanKey
  hits: number
}

export type PrMetrics = {
  postCount: number
  femalePrCount: number
  specificity: number
  freshness: number
  templateRate: number
  trust: number
  trend: number
}

export type ScoredEvent = EventInput & {
  score: number
  rank: number
  tone: SignalTone
  paidOnly: boolean
  store: StoreProfile
  metrics: PrMetrics
  reasons: string[]
}

export type WeekdayPostStat = {
  weekday: string
  count: number
  ratio: number
}

export type StoreBbsAnalytics = {
  store: StoreProfile
  postCount: number
  postRatio: number
  excitement: number
  femalePrRatio: number
  specificity: number
  dominantWeekday: string
  weekdayStats: WeekdayPostStat[]
  verdict: string
}

export type ExactTermSearchGroup = {
  group: ExactTermGroup
  label: string
  terms: string[]
}

export type ExactTermMatch = {
  id: string
  group: ExactTermGroup
  groupLabel: string
  term: string
  store: StoreProfile
  post: PostRecord
  snippet: string
}

export type ExactTermState = Record<ExactTermGroup, string>

export type NotificationJob = {
  id: string
  title: string
  body: string
  channel: NotificationChannel
  audience: PlanKey
  scheduledFor: string
  status: 'queued' | 'sent' | 'dry_run' | 'failed'
}

export type NotificationPreference = {
  email: string
  webhookUrl: string
  channel: NotificationChannel
  audience: PlanKey
}

export type SubscriptionState = {
  plan: PlanKey
  status: string
  stripeCustomerId?: string
  stripeSubscriptionId?: string
}

export type ImportBatch = {
  id: string
  kind: 'stores' | 'events' | 'posts'
  importedCount: number
  errorCount: number
  createdAt: string
}

export type SetupStatusItem = {
  id: string
  label: string
  tone: SetupStatusTone
  summary: string
  detail: string
}

export type ServiceSetupStatus = {
  generatedAt: string
  actionCount: number
  checkCount: number
  items: SetupStatusItem[]
}

export type ScrapeResult = {
  url: string
  title: string
  extractedText: string
  fetchedAt: string
  status: 'ok' | 'blocked' | 'failed'
  message?: string
}

export type AiAnalysis = {
  summary: string
  keywords: string[]
  eventCategory: string
  session: SessionKind
  specificity: number
  femalePrSignals: string[]
  safetyNotes: string[]
}

export type DashboardState = {
  mode: RuntimeMode
  userEmail?: string
  connectionNote?: string
  setupStatus: ServiceSetupStatus
  stores: StoreProfile[]
  events: EventInput[]
  posts: PostRecord[]
  scoredEvents: ScoredEvent[]
  situations: StoreSituation[]
  bbsSources: BbsSource[]
  crawlRuns: CrawlRun[]
  bbsSnapshots: BbsSnapshot[]
  storeDecisions: Record<string, StoreDecisionState>
  exactTerms: ExactTermState
  wordBookmarks: WordBookmark[]
  notificationJobs: NotificationJob[]
  notificationPreference: NotificationPreference
  importBatches: ImportBatch[]
  subscription: SubscriptionState
  wordCategories: WordCategory[]
}
