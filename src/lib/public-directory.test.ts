import assert from 'node:assert/strict'
import test from 'node:test'
import { sortByRanking, type PublicStoreSummary } from './public-directory'

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
