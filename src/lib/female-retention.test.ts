import assert from 'node:assert/strict'
import test from 'node:test'
import { buildFemaleRetentionDataset, femaleRetentionWindow, normalizeRetentionAuthorName } from './female-retention'
import type { BbsNormalizedPost } from './types'

function post(input: {
  id: string
  authorName: string
  authorGender?: string
  postedAt: string
  body?: string
}): BbsNormalizedPost {
  return {
    id: input.id,
    storeId: 'store-a',
    articleNo: input.id,
    authorName: input.authorName,
    authorGender: input.authorGender ?? '女性',
    postedAt: input.postedAt,
    observedAt: input.postedAt,
    body: input.body ?? '本日伺います。',
    bodyHash: `hash-${input.id}`,
    contentKey: `key-${input.id}`,
  }
}

test('female retention compares the same normalized name on the same business weekday across weeks', () => {
  const dataset = buildFemaleRetentionDataset({
    referenceAt: '2026-07-20T12:00:00+09:00',
    posts: [
      post({ id: 'mika-1', authorName: 'Mika', postedAt: '2026-07-06T20:00:00+09:00' }),
      post({ id: 'mika-2', authorName: 'Ｍｉｋａ ', postedAt: '2026-07-13T20:00:00+09:00' }),
      post({ id: 'mika-duplicate', authorName: 'Mika', postedAt: '2026-07-13T21:00:00+09:00' }),
      post({ id: 'aya-1', authorName: 'Aya', postedAt: '2026-07-07T20:00:00+09:00' }),
      post({ id: 'mika-tuesday', authorName: 'Mika', postedAt: '2026-07-14T20:00:00+09:00' }),
      post({ id: 'male', authorName: 'Mika', authorGender: '男性', postedAt: '2026-07-20T19:00:00+09:00' }),
      post({ id: 'inferred-only', authorName: 'Rin（女性）', authorGender: '記載なし', postedAt: '2026-07-20T19:30:00+09:00' }),
      post({ id: 'generic', authorName: '匿名', postedAt: '2026-07-20T20:00:00+09:00' }),
      post({ id: 'too-old', authorName: 'Old', postedAt: '2026-04-01T20:00:00+09:00' }),
    ],
  })

  const monday = dataset.weekdays.find((item) => item.weekday === '月曜')!
  const tuesday = dataset.weekdays.find((item) => item.weekday === '火曜')!
  assert.deepEqual(monday, {
    weekday: '月曜',
    eligibleAuthorCount: 1,
    returningAuthorCount: 1,
    retentionRate: 100,
    postCount: 3,
    observedWeekCount: 2,
    status: 'low_sample',
  })
  assert.equal(tuesday.eligibleAuthorCount, 2)
  assert.equal(tuesday.returningAuthorCount, 0)
  assert.equal(tuesday.retentionRate, 0)
  assert.equal(dataset.eligibleAuthorWeekdayCount, 3)
  assert.equal(dataset.returningAuthorWeekdayCount, 1)
  assert.equal(dataset.retentionRate, 33)
  assert.equal(dataset.eligiblePostCount, 5)
  assert.equal(dataset.status, 'measured')
  assert.doesNotMatch(JSON.stringify(dataset), /mika|aya/i)
})

test('posts before 06:00 JST belong to the previous business weekday', () => {
  const dataset = buildFemaleRetentionDataset({
    referenceAt: '2026-07-20T12:00:00+09:00',
    posts: [
      post({ id: 'early-1', authorName: 'Early', postedAt: '2026-07-07T05:30:00+09:00' }),
      post({ id: 'early-2', authorName: 'Early', postedAt: '2026-07-14T05:30:00+09:00' }),
    ],
  })

  const monday = dataset.weekdays.find((item) => item.weekday === '月曜')!
  const tuesday = dataset.weekdays.find((item) => item.weekday === '火曜')!
  assert.equal(monday.retentionRate, 100)
  assert.equal(monday.returningAuthorCount, 1)
  assert.equal(tuesday.eligibleAuthorCount, 0)
})

test('retention helpers normalize safe names and return an eight-week window', () => {
  assert.equal(normalizeRetentionAuthorName(' Ｍｉｋａ （女性） '), 'mika')
  assert.equal(normalizeRetentionAuthorName('記載なし'), '')
  assert.equal(normalizeRetentionAuthorName('---'), '')
  assert.deepEqual(femaleRetentionWindow('2026-07-20T12:00:00+09:00'), {
    startKey: '2026-05-26',
    endKey: '2026-07-20',
    windowWeeks: 8,
    postedAfter: '2026-05-26T06:00:00+09:00',
  })
})
