import assert from 'node:assert/strict'
import test from 'node:test'
import { buildDailyStoreDataset, DAILY_INSIGHT_CONTRACT_VERSION } from './daily-store-insights'
import type { BbsNormalizedPost, BbsSource, StoreProfile } from './types'

const referenceAt = '2026-07-10T12:00:00.000Z'

function store(id: string): StoreProfile {
  return {
    id,
    name: id,
    area: '都内',
    tags: [],
    hasDaytime: false,
    hasNight: true,
    openingHourDay: '',
    openingHourNight: '19:00',
    prStructure: '',
    strongDays: [],
    strongEvents: [],
    weakEvents: [],
    trustSeed: 60,
  }
}

function source(storeId: string, status: BbsSource['lastStatus'] = 'ok'): BbsSource {
  return {
    id: `source-${storeId}`,
    storeId,
    label: 'BBS',
    url: `https://example.com/${storeId}`,
    parserType: 'auto',
    active: true,
    crawlIntervalMinutes: 5,
    lastFetchedAt: '2026-07-10T11:55:00.000Z',
    lastStatus: status,
  }
}

function post(input: {
  id: string
  storeId: string
  postedAt?: string
  authorName: string
  authorGender?: string
}): BbsNormalizedPost {
  return {
    id: input.id,
    storeId: input.storeId,
    authorName: input.authorName,
    authorGender: input.authorGender ?? '記載なし',
    postedAt: input.postedAt,
    observedAt: '2026-07-10T11:55:00.000Z',
    body: '今夜伺います。',
    bodyHash: `hash-${input.id}`,
    contentKey: `key-${input.id}`,
  }
}

test('daily insight contract ranks all customer posts and exposes one shared basis', () => {
  const stores = [store('total-posts'), store('female-posts')]
  const normalizedPosts = [
    post({ id: 'total-1', storeId: 'total-posts', postedAt: '2026-07-10T10:30:00.000Z', authorName: 'A', authorGender: '男性' }),
    post({ id: 'total-2', storeId: 'total-posts', postedAt: '2026-07-10T11:00:00.000Z', authorName: 'B', authorGender: '男性' }),
    post({ id: 'total-3', storeId: 'total-posts', postedAt: '2026-07-10T11:30:00.000Z', authorName: 'C', authorGender: '男性' }),
    post({ id: 'female-1', storeId: 'female-posts', postedAt: '2026-07-10T11:20:00.000Z', authorName: 'あや♀' }),
    post({ id: 'female-2', storeId: 'female-posts', postedAt: '2026-07-10T11:40:00.000Z', authorName: 'まい', authorGender: '女性' }),
    post({ id: 'time-unknown', storeId: 'female-posts', authorName: '時刻不明♀' }),
  ]
  const dataset = buildDailyStoreDataset({
    stores,
    events: [
      {
        id: 'far-weekend',
        storeId: 'total-posts',
        date: '2026-08-01',
        weekday: '土曜',
        startsAt: '19:00',
        session: 'night',
        category: 'イベント',
        title: '来月イベント',
      },
    ],
    rawPosts: [],
    sources: stores.map((item) => source(item.id)),
    snapshots: [],
    normalizedPosts,
    referenceAt,
  })

  assert.equal(DAILY_INSIGHT_CONTRACT_VERSION, '2026-07-11')
  assert.equal(dataset.insights[0].store.id, 'total-posts')
  assert.equal(dataset.insights[0].rank, 1)
  assert.equal(dataset.insights[0].activity.recentPostCount, 3)
  assert.deepEqual(dataset.insights[0].rankingPostIds.toSorted(), [
    'normalized-total-1',
    'normalized-total-2',
    'normalized-total-3',
  ])
  assert.equal(dataset.insights[1].activity.femalePostCount, 2)
  assert.equal(dataset.insights[1].excludedUntimestampedCount, 1)
  assert.equal(dataset.insights[0].weekendEventCount, 0)
  assert.equal(dataset.insights[0].rankingBasis, 'business_customer_posts')
  assert.match(dataset.insights[0].businessWindowLabel, /7\/10 夜部 19:00-翌05:00/)
})

test('daily insight contract separates crawl failure from the last successful data', () => {
  const target = store('blocked-store')
  const dataset = buildDailyStoreDataset({
    stores: [target],
    events: [],
    rawPosts: [],
    sources: [source(target.id, 'blocked')],
    snapshots: [],
    normalizedPosts: [
      post({ id: 'blocked-post', storeId: target.id, postedAt: '2026-07-10T11:30:00.000Z', authorName: '投稿者' }),
    ],
    referenceAt,
  })

  assert.equal(dataset.insights[0].reliability, 'blocked')
  assert.match(dataset.insights[0].reliabilityLabel, /直前データを使用/)
  assert.equal(dataset.insights[0].activity.recentPostCount, 1)
})
