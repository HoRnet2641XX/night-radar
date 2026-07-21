import assert from 'node:assert/strict'
import test from 'node:test'
import { buildDailyStoreDataset } from '@/lib/daily-store-insights'
import type { PublicDirectoryState } from '@/lib/public-directory'
import { normalizedBbsPostsToPostRecords } from '@/lib/scoring'
import type { BbsNormalizedPost, DashboardState, EventInput, StoreProfile } from '@/lib/types'
import { adaptDashboardToBars, adaptPublicDirectoryToBars } from './adapter'
import { summarizeAudience } from './audience'

const store: StoreProfile = {
  id: 'store-1',
  name: 'BAR TEST',
  area: '新宿',
  tags: [],
  hasDaytime: false,
  hasNight: true,
  openingHourDay: '',
  openingHourNight: '19:00',
  prStructure: '',
  strongDays: [],
  strongEvents: [],
  weakEvents: [],
  trustSeed: 70,
}

const normalizedPosts: BbsNormalizedPost[] = [
  {
    id: 'female-1',
    storeId: store.id,
    authorName: 'あや',
    authorGender: '女性',
    postedAt: '2026-07-10T11:20:00.000Z',
    observedAt: '2026-07-10T11:25:00.000Z',
    body: '初めてです。2人で伺います。女性同士です。',
    bodyHash: 'female-hash',
    contentKey: 'female-key',
  },
  {
    id: 'male-1',
    storeId: store.id,
    authorName: 'たく',
    authorGender: '男性',
    postedAt: '2026-07-10T11:40:00.000Z',
    observedAt: '2026-07-10T11:45:00.000Z',
    body: '今夜伺います。',
    bodyHash: 'male-hash',
    contentKey: 'male-key',
  },
  {
    id: 'female-history',
    storeId: store.id,
    authorName: 'あや',
    authorGender: '女性',
    postedAt: '2026-07-09T11:00:00.000Z',
    observedAt: '2026-07-09T11:05:00.000Z',
    body: '昨日も伺いました。',
    bodyHash: 'female-history-hash',
    contentKey: 'female-history-key',
  },
]

const event: EventInput = {
  id: 'event-1',
  storeId: store.id,
  date: '2026-07-10',
  weekday: '金',
  startsAt: '19:00',
  session: 'night',
  category: 'BINGO',
  title: 'BINGOナイト',
  sourceUrl: 'https://example.com/event',
}

const state: DashboardState = {
  mode: 'database',
  userId: 'user-1',
  userDisplayName: 'テストユーザー',
  setupStatus: {
    generatedAt: '2026-07-10T12:00:00.000Z',
    actionCount: 0,
    checkCount: 0,
    items: [],
  },
  stores: [store],
  events: [event],
  posts: normalizedBbsPostsToPostRecords(normalizedPosts),
  scoredEvents: [],
  situations: [],
  bbsSources: [
    {
      id: 'source-1',
      storeId: store.id,
      label: 'BBS',
      url: 'https://example.com/bbs',
      parserType: 'auto',
      active: true,
      crawlIntervalMinutes: 5,
      lastFetchedAt: '2026-07-10T11:55:00.000Z',
      lastStatus: 'ok',
    },
  ],
  crawlRuns: [],
  bbsSnapshots: [],
  bbsNormalizedPosts: normalizedPosts,
  dailyInsights: [],
  storeDecisions: {},
  exactTerms: {
    popularSingleMale: '',
    popularSingleFemale: '',
    negativePerson: '',
  },
  wordBookmarks: [],
  notificationJobs: [],
  notificationPreference: {
    email: '',
    webhookUrl: '',
    channel: 'in_app',
    audience: 'free',
  },
  importBatches: [],
  subscription: {
    plan: 'free',
    status: 'active',
  },
  wordCategories: [],
}

function withDailyInsights(input: DashboardState, events = input.events): DashboardState {
  const dataset = buildDailyStoreDataset({
    stores: input.stores,
    events,
    rawPosts: input.posts,
    sources: input.bbsSources,
    snapshots: input.bbsSnapshots,
    normalizedPosts: input.bbsNormalizedPosts,
    businessContextPosts: input.businessContextPosts,
    referenceAt: input.setupStatus.generatedAt,
  })
  return { ...input, events, posts: dataset.effectivePosts, dailyInsights: dataset.insights }
}

test('adapter maps current decision-date data without reservation placeholders', () => {
  const result = adaptDashboardToBars(withDailyInsights(state), [event])
  const bar = result.bars[0]

  assert.equal(result.meta.postCount, 2)
  assert.equal(result.meta.todayEventCount, 1)
  assert.equal(result.meta.eventCoverageStoreCount, 1)
  assert.equal(result.meta.eventUnverifiedStoreCount, 0)
  assert.equal(result.meta.recentThreeHourCount, 2)
  assert.equal(bar.femaleCount, 1)
  assert.equal(bar.femaleRatio, null)
  assert.equal(bar.genderSampleCount, 2)
  assert.equal(bar.recentThreeHourCount, 2)
  assert.equal(bar.uniqueAuthorCount, 2)
  assert.equal(bar.repeatAuthorRatio, 50)
  assert.equal(bar.normalizedCoverage, 100)
  assert.equal(bar.timestampCoverage, 100)
  assert.equal(bar.authorCoverage, 100)
  assert.equal(bar.genderCoverage, 100)
  assert.equal(bar.genderUnknownCount, 0)
  assert.ok(bar.dataConfidence >= 75)
  assert.equal(bar.firstVisitCount, 1)
  assert.equal(bar.groupCount, 1)
  assert.equal(bar.eventCount, 1)
  assert.equal(bar.eventStatus, 'scheduled')
  assert.equal(bar.postCount, 2)
  assert.equal(bar.vibe, 100)
  assert.equal(bar.crowd, 100)
  assert.equal(bar.music, 100)
  assert.equal(bar.signalCount, 1)
  assert.equal(bar.reliability, 'fresh')
  assert.ok(bar.score <= 100)
  assert.equal(Object.hasOwn(bar, 'liveSeats'), false)
  assert.equal(result.events[0].tag, 'BINGO')
  assert.ok(bar.searchKeywords.includes(store.name))
  assert.ok(bar.searchKeywords.includes(event.title))
  assert.equal(result.posts.filter((post) => post.isCurrentBusinessDay).length, 2)
  assert.match(bar.mapUrl ?? '', /google\.com\/maps\/search/)
  assert.equal(bar.officialUrl, 'https://example.com/')
})

test('audience summary reconciles categories to the same-day total and uses total posts for female rate', () => {
  const summary = summarizeAudience({ male: 5, female: 16, couple: 0 }, 88)

  assert.equal(summary.classified, 21)
  assert.equal(summary.counts.unknown, 67)
  assert.equal(summary.total, 88)
  assert.equal(summary.femaleRate, 18)
  assert.equal(summary.isConsistent, true)
})

test('adapter labels the event total as the current month only', () => {
  const nextMonthEvent: EventInput = {
    ...event,
    id: 'event-next-month',
    date: '2026-08-01',
  }
  const events = [event, nextMonthEvent]
  const result = adaptDashboardToBars(withDailyInsights({ ...state, events }, events), events)

  assert.equal(result.events.length, 2)
  assert.equal(result.meta.eventCount, 1)
})

test('adapter distinguishes no event today from an unverified event calendar', () => {
  const verifiedStore = { ...store, id: 'verified-store', name: 'BAR VERIFIED' }
  const unverifiedStore = { ...store, id: 'unverified-store', name: 'BAR UNVERIFIED' }
  const monthlyEvent: EventInput = {
    ...event,
    id: 'future-month-event',
    storeId: verifiedStore.id,
    date: '2026-07-18',
  }
  const input = withDailyInsights({
    ...state,
    stores: [verifiedStore, unverifiedStore],
    events: [monthlyEvent],
    posts: [],
    bbsNormalizedPosts: [],
    bbsSources: [],
  }, [monthlyEvent])
  const result = adaptDashboardToBars(input, [monthlyEvent])

  assert.equal(result.bars.find((bar) => bar.id === verifiedStore.id)?.eventStatus, 'none')
  assert.equal(result.bars.find((bar) => bar.id === unverifiedStore.id)?.eventStatus, 'unverified')
  assert.equal(result.meta.eventCoverageStoreCount, 1)
  assert.equal(result.meta.eventUnverifiedStoreCount, 1)
})

test('adapter uses the active night business date after midnight for today events', () => {
  const activeNightEvent: EventInput = {
    ...event,
    id: 'active-night-event',
    date: '2026-07-12',
  }
  const nextCalendarEvent: EventInput = {
    ...event,
    id: 'next-calendar-event',
    date: '2026-07-13',
  }
  const afterMidnightState = {
    ...state,
    setupStatus: { ...state.setupStatus, generatedAt: '2026-07-12T19:10:00.000Z' },
    events: [activeNightEvent, nextCalendarEvent],
    posts: [],
    bbsNormalizedPosts: [],
  }
  const result = adaptDashboardToBars(
    withDailyInsights(afterMidnightState, [activeNightEvent, nextCalendarEvent]),
    [activeNightEvent, nextCalendarEvent],
  )

  assert.equal(result.meta.todayKey, '2026-07-12')
  assert.equal(result.meta.todayEventCount, 1)
  assert.equal(result.bars[0].eventCount, 1)
})

test('adapter ranks by all current decision-date posts before female count', () => {
  const activeStore: StoreProfile = { ...store, id: 'store-2', name: 'BAR TOTAL' }
  const activePosts: BbsNormalizedPost[] = [0, 1, 2].map((index) => ({
    id: `total-${index}`,
    storeId: activeStore.id,
    authorName: `投稿者${index}`,
    authorGender: '男性',
    postedAt: `2026-07-10T11:${10 + index * 10}:00.000Z`,
    observedAt: '2026-07-10T11:45:00.000Z',
    body: '今夜伺います。',
    bodyHash: `total-hash-${index}`,
    contentKey: `total-key-${index}`,
  }))
  const allNormalized = [...normalizedPosts, ...activePosts]
  const result = adaptDashboardToBars(withDailyInsights({
    ...state,
    stores: [store, activeStore],
    posts: normalizedBbsPostsToPostRecords(allNormalized),
    bbsNormalizedPosts: allNormalized,
    bbsSources: [
      ...state.bbsSources,
      {
        ...state.bbsSources[0],
        id: 'source-2',
        storeId: activeStore.id,
      },
    ],
  }))

  assert.equal(result.bars[0].id, activeStore.id)
  assert.equal(result.bars[0].postCount, 3)
  assert.equal(result.bars[1].femaleCount, 1)
})

test('adapter excludes posts whose original writing time could not be parsed', () => {
  const withoutPostedAt: BbsNormalizedPost = {
    id: 'time-unknown',
    storeId: store.id,
    authorName: '時刻不明',
    authorGender: '女性',
    observedAt: '2026-07-10T11:50:00.000Z',
    body: '過去の書き込みかもしれない投稿です。',
    bodyHash: 'time-unknown-hash',
    contentKey: 'time-unknown-key',
  }
  const allNormalized = [...normalizedPosts, withoutPostedAt]
  const result = adaptDashboardToBars(withDailyInsights({
    ...state,
    posts: normalizedBbsPostsToPostRecords(allNormalized),
    bbsNormalizedPosts: allNormalized,
  }), [event])

  assert.equal(result.meta.postCount, 2)
  assert.equal(result.bars[0].femaleCount, 1)
  assert.equal(result.bars[0].timestampCoverage, 67)
})

test('adapter does not assign confidence without a source or measured posts', () => {
  const result = adaptDashboardToBars(withDailyInsights({
    ...state,
    events: [],
    posts: [],
    bbsSources: [],
    bbsNormalizedPosts: [],
  }))

  assert.equal(result.bars[0].dataConfidence, 0)
  assert.equal(result.bars[0].reliability, 'unknown')
})

test('public adapter exposes the server-calculated weekly momentum without raw history', () => {
  const dashboard = withDailyInsights(state)
  const publicState: PublicDirectoryState = {
    mode: 'database',
    stores: dashboard.stores,
    events: dashboard.events,
    sources: dashboard.bbsSources,
    normalizedPosts: dashboard.bbsNormalizedPosts,
    dailyInsights: dashboard.dailyInsights,
    summaries: [],
    generatedAt: dashboard.setupStatus.generatedAt,
    weeklyMomentum: {
      currentStartsAt: '2026-07-09T21:00:00.000Z',
      currentEndsAt: '2026-07-10T12:00:00.000Z',
      previousStartsAt: '2026-07-02T21:00:00.000Z',
      previousEndsAt: '2026-07-03T12:00:00.000Z',
      comparisonDayCount: 1,
      minimumComparisonCount: 3,
      measuredStoreCount: 1,
      newActivityStoreCount: 0,
      stores: [{
        storeId: store.id,
        currentPostCount: 9,
        previousPostCount: 6,
        postDelta: 3,
        momentumPercent: 60,
        weekOverWeekRatio: 150,
        changePercent: 50,
        status: 'measured',
        rank: 1,
      }],
    },
  }
  const result = adaptPublicDirectoryToBars(publicState)

  assert.equal(result.weeklyMomentum.ranking.length, 1)
  assert.equal(result.weeklyMomentum.ranking[0].storeName, 'bar BAR TEST')
  assert.equal(result.weeklyMomentum.ranking[0].momentumPercent, 60)
  assert.equal(result.weeklyMomentum.ranking[0].weekOverWeekRatio, 150)
  assert.equal(result.weeklyMomentum.ranking[0].postDelta, 3)
  assert.equal(result.weeklyMomentum.comparisonDayCount, 1)
  assert.match(result.weeklyMomentum.currentPeriodLabel, /7\/10/)
})
