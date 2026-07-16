import assert from 'node:assert/strict'
import test from 'node:test'
import type { BbsNormalizedPost, StoreProfile } from './types'
import { buildWeeklyMomentumDataset, weeklyComparisonWindow } from './weekly-store-momentum'

const stores = ['rising', 'steady', 'new', 'quiet'].map((id) => ({ id })) as Pick<StoreProfile, 'id'>[]

function post(input: {
  id: string
  storeId: string
  postedAt?: string
  articleNo?: string
  authorName?: string
  body?: string
}): BbsNormalizedPost {
  return {
    id: input.id,
    storeId: input.storeId,
    articleNo: input.articleNo,
    authorName: input.authorName ?? `投稿者-${input.id}`,
    authorGender: '記載なし',
    postedAt: input.postedAt,
    observedAt: input.postedAt ?? '2026-07-15T03:00:00.000Z',
    body: input.body ?? '今週伺います。',
    bodyHash: `hash-${input.id}`,
    contentKey: `key-${input.id}`,
  }
}

function series(storeId: string, prefix: string, timestamps: string[]) {
  return timestamps.map((postedAt, index) => post({
    id: `${prefix}-${index}`,
    storeId,
    postedAt,
    articleNo: `${prefix}-${index}`,
  }))
}

test('weekly window compares the current business day with exactly seven days earlier at the same elapsed time', () => {
  const window = weeklyComparisonWindow('2026-07-15T03:00:00.000Z')

  assert.equal(window.currentStartsAt, '2026-07-14T21:00:00.000Z')
  assert.equal(window.currentEndsAt, '2026-07-15T03:00:00.000Z')
  assert.equal(window.previousStartsAt, '2026-07-07T21:00:00.000Z')
  assert.equal(window.previousEndsAt, '2026-07-08T03:00:00.000Z')
})

test('weekly momentum ranks exact business-day post-count deltas only when both dates have a stable sample', () => {
  const normalizedPosts = [
    ...series('rising', 'rising-previous', [
      '2026-07-07T22:00:00.000Z',
      '2026-07-07T23:00:00.000Z',
      '2026-07-08T01:00:00.000Z',
      '2026-07-08T02:00:00.000Z',
    ]),
    ...series('rising', 'rising-current', [
      '2026-07-14T21:10:00.000Z',
      '2026-07-14T22:00:00.000Z',
      '2026-07-14T23:00:00.000Z',
      '2026-07-15T00:00:00.000Z',
      '2026-07-15T01:00:00.000Z',
      '2026-07-15T01:30:00.000Z',
      '2026-07-15T02:00:00.000Z',
      '2026-07-15T02:30:00.000Z',
    ]),
    ...series('steady', 'steady-previous', [
      '2026-07-07T22:10:00.000Z',
      '2026-07-07T23:10:00.000Z',
      '2026-07-08T01:10:00.000Z',
      '2026-07-08T02:10:00.000Z',
    ]),
    ...series('steady', 'steady-current', [
      '2026-07-14T22:10:00.000Z',
      '2026-07-14T23:10:00.000Z',
      '2026-07-15T01:10:00.000Z',
      '2026-07-15T02:10:00.000Z',
    ]),
    ...series('new', 'new-current', [
      '2026-07-14T22:20:00.000Z',
      '2026-07-14T23:20:00.000Z',
      '2026-07-15T00:20:00.000Z',
      '2026-07-15T01:20:00.000Z',
      '2026-07-15T02:20:00.000Z',
    ]),
    post({
      id: 'outside-same-period',
      storeId: 'rising',
      postedAt: '2026-07-08T04:00:00.000Z',
      articleNo: 'outside-same-period',
    }),
    post({
      id: 'staff-post',
      storeId: 'rising',
      postedAt: '2026-07-15T02:30:00.000Z',
      authorName: 'スタッフ',
      articleNo: 'staff-post',
    }),
    post({
      id: 'duplicate-newer',
      storeId: 'rising',
      postedAt: '2026-07-15T02:00:00.000Z',
      articleNo: 'rising-current-7',
      body: '同じ記事です。',
    }),
  ]

  const dataset = buildWeeklyMomentumDataset({
    stores,
    normalizedPosts,
    referenceAt: '2026-07-15T03:00:00.000Z',
  })
  const rising = dataset.stores.find((item) => item.storeId === 'rising')
  const steady = dataset.stores.find((item) => item.storeId === 'steady')
  const newActivity = dataset.stores.find((item) => item.storeId === 'new')
  const quiet = dataset.stores.find((item) => item.storeId === 'quiet')

  assert.deepEqual(rising, {
    storeId: 'rising',
    currentPostCount: 8,
    previousPostCount: 4,
    postDelta: 4,
    momentumPercent: 67,
    weekOverWeekRatio: 200,
    changePercent: 100,
    status: 'measured',
    rank: 1,
  })
  assert.equal(steady?.weekOverWeekRatio, 100)
  assert.equal(steady?.momentumPercent, 50)
  assert.equal(steady?.rank, 2)
  assert.equal(newActivity?.status, 'new_activity')
  assert.equal(newActivity?.weekOverWeekRatio, null)
  assert.equal(newActivity?.momentumPercent, null)
  assert.equal(newActivity?.rank, null)
  assert.equal(quiet?.status, 'no_activity')
  assert.equal(dataset.comparisonDayCount, 1)
  assert.equal(dataset.measuredStoreCount, 2)
  assert.equal(dataset.newActivityStoreCount, 1)
})
