import assert from 'node:assert/strict'
import test from 'node:test'
import { filterPublicStores, publicConditions, sortByRanking, type PublicStoreSummary } from './public-directory'
import { resolvedStoreArea, resolvedStoreMetadata } from './store-catalog'
import type { StoreProfile } from './types'

function storeSummary(input: {
  id: string
  score: number
  femalePostCount: number
  recentPostCount?: number
  recentThreeHourCount?: number
  womenRatio?: number | null
  todayEventCount?: number
  eventCount?: number
  isOpenNow?: boolean
  weekendEventCount?: number
  dataConfidence?: number
}): PublicStoreSummary {
  return {
    store: { id: input.id, name: input.id, area: 'test', trustSeed: 60 } as PublicStoreSummary['store'],
    point: { score: input.score, store: { id: input.id, name: input.id } } as PublicStoreSummary['point'],
    areaLabel: 'test',
    stationLabel: 'test',
    addressLabel: 'test',
    mapUrl: 'https://example.com',
    priceLabel: 'test',
    sessionLabel: 'test',
    womenRatio: input.womenRatio ?? null,
    femalePostCount: input.femalePostCount,
    genderSampleCount: input.femalePostCount,
    genderCoverage: input.recentPostCount ? Math.round((input.femalePostCount / input.recentPostCount) * 100) : 0,
    recentPostCount: input.recentPostCount ?? 0,
    recentThreeHourCount: input.recentThreeHourCount ?? 0,
    todayEventCount: input.todayEventCount ?? 0,
    upcomingEventCount: input.eventCount ?? 0,
    weekendEventCount: input.weekendEventCount ?? 0,
    lastUpdatedLabel: 'test',
    isOpenNow: input.isOpenNow ?? false,
    temperatureLabel: 'test',
    primaryReason: 'test',
    dataConfidence: input.dataConfidence ?? 70,
    dataConfidenceLabel: '集計信頼度 中',
    businessWindowLabel: 'test',
    reliabilityLabel: '取得良好',
    excludedUntimestampedCount: 0,
  } as PublicStoreSummary
}

test('today ranking prioritizes all customer posts regardless of gender', () => {
  const ranked = sortByRanking(
    [
      storeSummary({ id: 'all-posts-active', score: 55, femalePostCount: 1, recentPostCount: 8 }),
      storeSummary({ id: 'female-active', score: 100, femalePostCount: 4, recentPostCount: 4 }),
    ],
    'today',
  )

  assert.equal(ranked[0].store.id, 'all-posts-active')
})

test('female ranking keeps female post count as its primary metric', () => {
  const ranked = sortByRanking(
    [
      storeSummary({ id: 'all-posts-active', score: 55, femalePostCount: 1, recentPostCount: 8 }),
      storeSummary({ id: 'female-active', score: 60, femalePostCount: 4, recentPostCount: 4 }),
    ],
    'female',
  )

  assert.equal(ranked[0].store.id, 'female-active')
})

test('event ranking keeps event availability before daily post count', () => {
  const ranked = sortByRanking(
    [
      storeSummary({ id: 'event-store', score: 60, femalePostCount: 1, todayEventCount: 1, eventCount: 1 }),
      storeSummary({ id: 'female-only-store', score: 95, femalePostCount: 8 }),
    ],
    'events',
  )

  assert.equal(ranked[0].store.id, 'event-store')
})

test('public store search ignores width and whitespace and includes event titles', () => {
  const retreat = storeSummary({ id: 'retreat-bar', score: 70, femalePostCount: 2, recentPostCount: 5 })
  retreat.store.name = 'RETREAT BAR'
  retreat.areaLabel = '新宿'
  retreat.nextEvent = {
    id: 'event-1',
    storeId: retreat.store.id,
    date: '2026-07-11',
    weekday: '土',
    startsAt: '19:00',
    session: 'night',
    category: 'イベント',
    title: 'ＢＩＮＧＯナイト',
  }

  assert.deepEqual(filterPublicStores([retreat], { query: 'retreatbar' }).map((item) => item.store.id), ['retreat-bar'])
  assert.deepEqual(filterPublicStores([retreat], { query: 'bingo ナイト' }).map((item) => item.store.id), ['retreat-bar'])
})

test('store area fallback never exposes generic seed values as verified locations', () => {
  assert.equal(resolvedStoreArea('retreat-bar', '都内'), '新宿')
  assert.equal(resolvedStoreArea('unknown-store', '未設定'), 'エリア未確認')
})

test('verified store metadata fills missing public details without replacing stored values', () => {
  const base = {
    id: 'neo',
    name: 'Neo',
    area: '未設定',
    tags: [],
    hasDaytime: true,
    hasNight: true,
    openingHourDay: '12:00',
    openingHourNight: '18:00',
    prStructure: '未分類',
    strongDays: [],
    strongEvents: [],
    weakEvents: [],
    trustSeed: 60,
  } satisfies StoreProfile
  const resolved = resolvedStoreMetadata(base)

  assert.equal(resolved.area, '錦糸町')
  assert.equal(resolved.officialUrl, 'https://neo-nk.com/')
  assert.equal(resolved.phone, '070-3274-3828')
  assert.match(resolved.mapUrl ?? '', /google\.com\/maps/)

  const stored = resolvedStoreMetadata({ ...base, phone: '03-0000-0000' })
  assert.equal(stored.phone, '03-0000-0000')
})

test('area filters include district labels and do not expose conditions without data', () => {
  const bar440 = storeSummary({ id: 'bar440', score: 60, femalePostCount: 1, recentPostCount: 5 })
  bar440.areaLabel = '新宿・歌舞伎町'

  assert.deepEqual(filterPublicStores([bar440], { area: 'shinjuku' }).map((item) => item.store.id), ['bar440'])
  assert.deepEqual(filterPublicStores([bar440], { area: 'tokyo' }).map((item) => item.store.id), ['bar440'])
  assert.equal(publicConditions.some((condition) => condition.key === 'price'), false)
})
