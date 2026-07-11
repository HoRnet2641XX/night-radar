import assert from 'node:assert/strict'
import test from 'node:test'
import { buildDailyStoreDataset } from '@/lib/daily-store-insights'
import { normalizedBbsPostsToPostRecords } from '@/lib/scoring'
import type { BbsNormalizedPost, DashboardState, EventInput, StoreProfile } from '@/lib/types'
import { adaptDashboardToBars } from './adapter'

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
  assert.ok(bar.dataConfidence >= 75)
  assert.equal(bar.firstVisitCount, 1)
  assert.equal(bar.groupCount, 1)
  assert.equal(bar.eventCount, 1)
  assert.equal(bar.vibe, 2)
  assert.equal(bar.crowd, 20)
  assert.equal(bar.music, 25)
  assert.equal(bar.signalCount, 1)
  assert.equal(bar.reliability, 'fresh')
  assert.ok(bar.score <= 100)
  assert.equal(Object.hasOwn(bar, 'liveSeats'), false)
  assert.equal(result.events[0].tag, 'BINGO')
  assert.ok(bar.searchKeywords.includes(store.name))
  assert.ok(bar.searchKeywords.includes(event.title))
  assert.match(bar.mapUrl ?? '', /google\.com\/maps\/search/)
  assert.equal(bar.officialUrl, 'https://example.com/')
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
