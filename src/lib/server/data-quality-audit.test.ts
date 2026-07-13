import assert from 'node:assert/strict'
import test from 'node:test'
import { auditDataQuality, eventTitleWeekdayMismatch, nextMonthKey } from './data-quality-audit'

test('next month keys are independent of the server time zone', () => {
  assert.equal(nextMonthKey('2026-07'), '2026-08')
  assert.equal(nextMonthKey('2026-12'), '2027-01')
})

test('event weekdays are derived from the calendar date, not the server time zone', () => {
  assert.equal(eventTitleWeekdayMismatch({ id: 'event-a', store_id: 'store-a', date_label: '2026-07-13', title: '月曜日イベント' }), false)
  assert.equal(eventTitleWeekdayMismatch({ id: 'event-b', store_id: 'store-a', date_label: '2026-07-13', title: '火曜日イベント' }), true)
})

const referenceAt = '2026-07-13T12:00:00.000Z'

test('known unknowns remain warnings and do not fail the audit', () => {
  const audit = auditDataQuality({
    stores: [{ id: 'store-a', address: null, nearest_station: '新宿駅' }],
    sources: [{
      id: 'source-a',
      store_id: 'store-a',
      label: 'BBS',
      last_status: 'ok',
      last_fetched_at: '2026-07-13T11:30:00.000Z',
    }],
    posts: [{
      id: 'post-a',
      source_id: 'source-a',
      store_id: 'store-a',
      author_name: '利用者A',
      author_gender: '女性',
      posted_at: '2026-07-13T11:00:00.000Z',
      observed_at: '2026-07-13T11:30:00.000Z',
      body: '本日20時ごろ伺います。',
      body_hash: 'hash-a',
      content_key: 'key-a',
    }],
    events: [{
      id: 'event-a',
      store_id: 'store-a',
      date_label: '2026-07-13',
      title: '本日のイベント',
      source_url: 'https://example.com/event',
    }],
    eventCoverage: [{
      storeId: 'store-a',
      storeName: '店舗A',
      month: '2026-07',
      status: 'scheduled',
      eventCount: 1,
      sourceUrls: ['https://example.com/event'],
      checkedAt: referenceAt,
      note: '確認済み',
    }],
    referenceAt,
  })

  assert.equal(audit.healthy, true)
  assert.deepEqual(audit.failures, [])
  assert.equal(audit.summary.addressPrivateWithGuidanceStores, 1)
  assert.equal(audit.summary.genderCoverage, 100)
})

test('a store without an event coverage record remains explicitly unverified', () => {
  const audit = auditDataQuality({
    stores: [{ id: 'store-a', address: '東京都内', nearest_station: '新宿駅' }],
    sources: [],
    posts: [],
    events: [],
    eventCoverage: [],
    referenceAt,
  })

  assert.equal(audit.healthy, true)
  assert.equal(audit.summary.eventUnverifiedStores, 1)
  assert.deepEqual(audit.details.eventUnverifiedStoreIds, ['store-a'])
  assert.ok(audit.warnings.some((warning) => warning.includes('当月イベント未確認 1店舗')))
})

test('crawl, post, event, and location regressions fail the audit', () => {
  const duplicatePost = {
    source_id: 'source-a',
    store_id: 'store-a',
    author_name: '利用者A',
    author_gender: '記載なし',
    posted_at: '2026-07-13T08:00:00.000Z',
    observed_at: '2026-07-13T08:10:00.000Z',
    body: '今夜伺います。',
    body_hash: 'same-hash',
    content_key: 'same-key',
  }
  const audit = auditDataQuality({
    stores: [{ id: 'store-a', address: null, nearest_station: null }],
    sources: [{
      id: 'source-a',
      store_id: 'store-a',
      last_status: 'failed',
      last_message: '解析件数が急減',
      last_fetched_at: '2026-07-13T01:00:00.000Z',
    }],
    posts: [
      { id: 'post-a', ...duplicatePost },
      { id: 'post-b', ...duplicatePost, content_key: 'different-storage-key' },
      {
        id: 'post-empty',
        source_id: 'source-a',
        store_id: 'store-a',
        observed_at: '2026-07-13T08:10:00.000Z',
        body: '',
      },
    ],
    events: [{
      id: 'event-a',
      store_id: 'store-a',
      date_label: '2026-07-13',
      title: '火曜日イベント',
      source_url: null,
    }],
    eventCoverage: [{
      storeId: 'store-a',
      storeName: '店舗A',
      month: '2026-07',
      status: 'unverified',
      eventCount: 0,
      sourceUrls: [],
      checkedAt: referenceAt,
      note: '',
    }],
    referenceAt,
  })

  assert.equal(audit.healthy, false)
  assert.ok(audit.failures.some((failure) => failure.includes('最終取得状態')))
  assert.ok(audit.failures.some((failure) => failure.includes('不完全な正規化投稿')))
  assert.ok(audit.failures.some((failure) => failure.includes('意味上同一')))
  assert.ok(audit.failures.some((failure) => failure.includes('イベント日付と曜日')))
  assert.ok(audit.failures.some((failure) => failure.includes('住所・最寄り駅')))
})
