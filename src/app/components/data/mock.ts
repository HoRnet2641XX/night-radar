export type DataReliability = 'fresh' | 'stale' | 'blocked' | 'unknown'

export type Bar = {
  id: string
  rank: number
  name: string
  area: string
  tags: string[]
  searchKeywords: string[]
  price: number
  vibe: number
  crowd: number
  music: number
  service: number
  drinks: number
  score: number
  trend: number[]
  hourly: number[]
  hourLabels: string[]
  note: string
  signalCount: number
  reason: string
  peakHour: string
  officialUrl?: string
  bbsUrl?: string
  mapUrl?: string
  phone?: string
  priceNote?: string
  sessionLabel?: string
  eventCount: number
  femaleCount: number
  femaleRatio: number | null
  genderSampleCount: number
  recentThreeHourCount: number
  recentThreeHourFemaleCount: number
  firstVisitCount: number
  groupCount: number
  uniqueAuthorCount: number
  repeatAuthorRatio: number | null
  normalizedCoverage: number
  timestampCoverage: number
  authorCoverage: number
  genderCoverage: number
  dataConfidence: number
  dataConfidenceLabel: string
  isWithinBusinessHours: boolean
  businessStatusLabel: string
  businessWindowLabel: string
  freshnessMinutes: number | null
  freshnessLabel: string
  postCount: number
  snapshotCount: number
  lastCapturedAt?: string
  sourceUpdatedAt?: string
  reliability: DataReliability
  reliabilityLabel: string
  rankingBasisLabel: string
  excludedUntimestampedCount: number
  genderUnknownCount: number
}

export type CalendarEventItem = {
  id: string
  date: string
  day: number
  title: string
  storeName: string
  tag: string
  color: string
  session: 'day' | 'night'
  sourceUrl?: string
  startsAt?: string
  detail?: string
}

export type RuntimeMeta = {
  generatedAt: string
  generatedAtLabel: string
  todayKey: string
  currentMonth: string
  currentMonthLabel: string
  freshCount: number
  staleCount: number
  sourceCount: number
  postCount: number
  recentThreeHourCount: number
  eventCount: number
  todayEventCount: number
  highConfidenceCount: number
  normalizedCoverageAverage: number
  timestampCoverageAverage: number
  rankingMetricLabel: string
  businessWindowSummary: string
  excludedUntimestampedCount: number
  bookmarkCount: number
  notificationCount: number
  planLabel: string
  modeLabel: string
  userDisplayName: string
  userEmail?: string
  summary: string
}

const emptyTrend = Array.from({ length: 12 }, () => 0)
const emptyHours = ['18', '19', '20', '21', '22', '23', '00', '01', '02', '03', '04', '05']

const fallbackBars: Bar[] = [
  {
    id: 'retreat-bar',
    rank: 1,
    name: 'bar RETREAT BAR',
    area: '都内',
    tags: ['データ接続待ち', '営業時間確認'],
    searchKeywords: ['RETREAT BAR', '都内'],
    price: 0,
    vibe: 0,
    crowd: 0,
    music: 0,
    service: 0,
    drinks: 0,
    score: 0,
    trend: emptyTrend,
    hourly: emptyTrend,
    hourLabels: emptyHours,
    note: 'BBSを取得すると、当日顧客投稿、女性書き込み、直近3時間の投稿が反映されます。',
    signalCount: 0,
    reason: '現在はデータ接続を確認しています。',
    peakHour: '確認中',
    eventCount: 0,
    femaleCount: 0,
    femaleRatio: null,
    genderSampleCount: 0,
    recentThreeHourCount: 0,
    recentThreeHourFemaleCount: 0,
    firstVisitCount: 0,
    groupCount: 0,
    uniqueAuthorCount: 0,
    repeatAuthorRatio: null,
    normalizedCoverage: 0,
    timestampCoverage: 0,
    authorCoverage: 0,
    genderCoverage: 0,
    dataConfidence: 0,
    dataConfidenceLabel: '観測中',
    isWithinBusinessHours: false,
    businessStatusLabel: '営業時間確認',
    businessWindowLabel: '営業時間を確認中',
    freshnessMinutes: null,
    freshnessLabel: '未確認',
    postCount: 0,
    snapshotCount: 0,
    reliability: 'unknown',
    reliabilityLabel: '未確認',
    rankingBasisLabel: '当日顧客投稿数',
    excludedUntimestampedCount: 0,
    genderUnknownCount: 0,
  },
]

export const BARS: Bar[] = fallbackBars
export const EVENTS: CalendarEventItem[] = []
export const TICKER: { name: string; signal: number; area: string }[] = tickerFromBars(fallbackBars)
export const RUNTIME_META: RuntimeMeta = createFallbackMeta()

export const RADAR_KEYS = [
  { key: 'vibe', label: '当日投稿量' },
  { key: 'drinks', label: '女性比率' },
  { key: 'service', label: '集計信頼度' },
  { key: 'music', label: '予定件数' },
  { key: 'crowd', label: '直近投稿' },
] as const

function createFallbackMeta(): RuntimeMeta {
  const now = new Date()
  const todayKey = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
  const currentMonth = todayKey.slice(0, 7)

  return {
    generatedAt: now.toISOString(),
    generatedAtLabel: '確認中',
    todayKey,
    currentMonth,
    currentMonthLabel: currentMonth.replace('-', '.'),
    freshCount: 0,
    staleCount: 0,
    sourceCount: 0,
    postCount: 0,
    recentThreeHourCount: 0,
    eventCount: 0,
    todayEventCount: 0,
    highConfidenceCount: 0,
    normalizedCoverageAverage: 0,
    timestampCoverageAverage: 0,
    rankingMetricLabel: '当日顧客投稿数',
    businessWindowSummary: '営業時間を確認中',
    excludedUntimestampedCount: 0,
    bookmarkCount: 0,
    notificationCount: 0,
    planLabel: '無料',
    modeLabel: '確認中',
    userDisplayName: 'Night Radar ユーザー',
    summary: 'データ接続を確認しています。',
  }
}

function tickerFromBars(bars: Bar[]) {
  return bars.map((bar) => ({
    name: bar.name.replace(/^bar\s+/i, ''),
    signal: bar.signalCount,
    area: bar.area.split(/[ /／]/)[0] || bar.area,
  }))
}

export { tickerFromBars }
