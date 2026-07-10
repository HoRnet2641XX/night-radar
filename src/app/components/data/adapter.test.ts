import assert from 'node:assert/strict'
import test from 'node:test'
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

test('adapter maps current business-window data without reservation placeholders', () => {
  const result = adaptDashboardToBars(state, [event])
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
  assert.equal(bar.signalCount, 1)
  assert.equal(bar.reliability, 'fresh')
  assert.ok(bar.score <= 100)
  assert.equal(Object.hasOwn(bar, 'liveSeats'), false)
  assert.equal(result.events[0].tag, 'BINGO')
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
  const result = adaptDashboardToBars({
    ...state,
    posts: normalizedBbsPostsToPostRecords(allNormalized),
    bbsNormalizedPosts: allNormalized,
  }, [event])

  assert.equal(result.meta.postCount, 2)
  assert.equal(result.bars[0].femaleCount, 1)
  assert.equal(result.bars[0].timestampCoverage, 75)
})

test('adapter does not assign confidence without a source or measured posts', () => {
  const result = adaptDashboardToBars({
    ...state,
    events: [],
    posts: [],
    bbsSources: [],
    bbsNormalizedPosts: [],
  })

  assert.equal(result.bars[0].dataConfidence, 0)
  assert.equal(result.bars[0].reliability, 'unknown')
})
