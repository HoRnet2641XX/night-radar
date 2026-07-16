import assert from 'node:assert/strict'
import test from 'node:test'
import type { PublicDirectoryState, PublicStoreSummary } from '@/lib/public-directory'
import {
  getXAutoPostConfig,
  inferXAutoPostSlot,
  parseXAutoPostSlot,
  prepareXDailyPost,
  prepareXScheduledPost,
  selectXDailyCandidates,
  XAutoPostPlanError,
  xWeightedLength,
} from './x-auto-post'

function summary(input: {
  id: string
  name: string
  postCount: number
  threeHourCount?: number
  confidence?: number
  reliability?: 'fresh' | 'stale' | 'blocked' | 'unknown'
  sourceStatus?: 'pending' | 'ok' | 'blocked' | 'failed'
  score?: number
  intentCount?: number
}) {
  return {
    store: { id: input.id, name: input.name },
    recentPostCount: input.postCount,
    recentThreeHourCount: input.threeHourCount ?? 0,
    dataConfidence: input.confidence ?? 90,
    insight: {
      reliability: input.reliability ?? 'fresh',
      activity: { estimatedVisitIntentCount: input.intentCount ?? input.postCount },
    },
    source: { lastStatus: input.sourceStatus ?? 'ok' },
    point: { score: input.score ?? 70 },
  } as unknown as PublicStoreSummary
}

function state(
  summaries: PublicStoreSummary[],
  mode: PublicDirectoryState['mode'] = 'database',
  overrides: Partial<PublicDirectoryState> = {},
) {
  return {
    mode,
    stores: summaries.map((item) => item.store),
    events: [],
    sources: [],
    normalizedPosts: [],
    weeklyMomentum: {
      currentStartsAt: '',
      currentEndsAt: '',
      previousStartsAt: '',
      previousEndsAt: '',
      comparisonDayCount: 1,
      minimumComparisonCount: 0,
      measuredStoreCount: 0,
      newActivityStoreCount: 0,
      stores: [],
    },
    dailyInsights: [],
    summaries,
    generatedAt: '2026-07-15T09:00:00.000Z',
    ...overrides,
  } as PublicDirectoryState
}

test('X auto-post configuration never treats partial credentials as ready', () => {
  assert.deepEqual(getXAutoPostConfig({
    X_AUTO_POST_ENABLED: 'true',
    X_API_KEY: 'key',
    X_API_SECRET: 'secret',
    X_ACCESS_TOKEN: 'token',
  }), {
    enabled: true,
    credentialsConfigured: false,
    includeUrl: true,
    targetUrl: 'https://night-radar.vercel.app/app',
    minimumDataConfidence: 60,
  })
})

test('X weighted length uses the transformed URL length', () => {
  assert.equal(xWeightedLength('A https://example.com/very/long/path B'), 27)
  assert.equal(xWeightedLength('今日'), 4)
})

test('X post slots are selected in Japan time', () => {
  assert.equal(parseXAutoPostSlot('evening'), 'evening')
  assert.equal(parseXAutoPostSlot('other'), null)
  assert.equal(inferXAutoPostSlot('2026-07-15T03:00:00.000Z'), 'midday')
  assert.equal(inferXAutoPostSlot('2026-07-15T09:00:00.000Z'), 'evening')
  assert.equal(inferXAutoPostSlot('2026-07-15T14:00:00.000Z'), 'tomorrow')
})

test('daily candidates use only fresh, successful, sufficiently reliable store aggregates', () => {
  const result = selectXDailyCandidates([
    summary({ id: 'a', name: 'A', postCount: 8, intentCount: 7, threeHourCount: 2 }),
    summary({ id: 'b', name: 'B', postCount: 12, confidence: 59 }),
    summary({ id: 'c', name: 'C', postCount: 10, reliability: 'stale' }),
    summary({ id: 'd', name: 'D', postCount: 9, sourceStatus: 'failed' }),
    summary({ id: 'e', name: 'E', postCount: 15, intentCount: 9, threeHourCount: 4 }),
    summary({ id: 'f', name: 'F', postCount: 0 }),
    summary({ id: 'g', name: 'G', postCount: 6, intentCount: 6, threeHourCount: 6 }),
    summary({ id: 'h', name: 'H', postCount: 5, intentCount: 5 }),
    summary({ id: 'i', name: 'I', postCount: 20, intentCount: 0 }),
  ], 60)

  assert.equal(result.eligibleStoreCount, 4)
  assert.deepEqual(result.candidates.map((candidate) => candidate.storeId), ['e', 'a', 'g'])
})

test('midday post uses rank labels, is aggregate-only, and stays within the X limit', () => {
  const plan = prepareXDailyPost(state([
    summary({ id: 'filt', name: 'FILT SHIBUYA', postCount: 57 }),
    summary({ id: 'agreeable', name: 'AgreeAble', postCount: 33 }),
    summary({ id: 'face', name: 'BAR FACE', postCount: 20 }),
  ]), { includeUrl: true, targetUrl: 'https://night-radar.vercel.app/app' })

  assert.equal(plan.idempotencyKey, 'today_ranking:2026-07-15')
  assert.equal(plan.scheduledFor, '2026-07-15T03:00:00.000Z')
  assert.match(plan.text, /🥇 bar FILT SHIBUYA｜🔥 アツすぎて滅 来店予告57件/)
  assert.match(plan.text, /🚀 テンアゲ/)
  assert.match(plan.text, /👀 じわアツ/)
  assert.doesNotMatch(plan.text, /投稿者|本文|author|body/)
  assert.ok(plan.weightedLength <= 280)
})

test('evening post ranks only stores with a measured positive weekly change', () => {
  const summaries = [
    summary({ id: 'face', name: 'BAR FACE', postCount: 24 }),
    summary({ id: 'agreeable', name: 'AgreeAble', postCount: 18 }),
    summary({ id: 'retreat', name: 'RETREAT BAR', postCount: 16 }),
    summary({ id: 'flat', name: 'FLAT', postCount: 14 }),
  ]
  const plan = prepareXScheduledPost(state(summaries, 'database', {
    weeklyMomentum: {
      currentStartsAt: '', currentEndsAt: '', previousStartsAt: '', previousEndsAt: '',
      comparisonDayCount: 3,
      minimumComparisonCount: 3, measuredStoreCount: 4, newActivityStoreCount: 0,
      stores: [
        { storeId: 'face', currentPostCount: 24, previousPostCount: 12, postDelta: 12, comparisonDayCount: 3, currentDailyAverage: 8, previousDailyAverage: 4, dailyAverageDelta: 4, momentumPercent: 67, weekOverWeekRatio: 200, changePercent: 100, status: 'measured', rank: 1 },
        { storeId: 'agreeable', currentPostCount: 18, previousPostCount: 10, postDelta: 8, comparisonDayCount: 3, currentDailyAverage: 6, previousDailyAverage: 3.3, dailyAverageDelta: 2.7, momentumPercent: 64, weekOverWeekRatio: 180, changePercent: 80, status: 'measured', rank: 2 },
        { storeId: 'retreat', currentPostCount: 16, previousPostCount: 12, postDelta: 4, comparisonDayCount: 3, currentDailyAverage: 5.3, previousDailyAverage: 4, dailyAverageDelta: 1.3, momentumPercent: 57, weekOverWeekRatio: 133, changePercent: 33, status: 'measured', rank: 3 },
        { storeId: 'flat', currentPostCount: 14, previousPostCount: 14, postDelta: 0, comparisonDayCount: 3, currentDailyAverage: 4.7, previousDailyAverage: 4.7, dailyAverageDelta: 0, momentumPercent: 50, weekOverWeekRatio: 100, changePercent: 0, status: 'measured', rank: 4 },
      ],
    },
  }), 'evening')

  assert.equal(plan.kind, 'weekly_momentum')
  assert.equal(plan.candidates.length, 3)
  assert.match(plan.text, /日平均\+4件/)
  assert.match(plan.text, /同曜日の日平均 TOP3/)
  assert.ok(plan.weightedLength <= 280)
})

test('tomorrow post uses only tomorrow events or visit-intent data', () => {
  const summaries = [
    summary({ id: 'a', name: 'A', postCount: 8 }),
    summary({ id: 'b', name: 'B', postCount: 7 }),
    summary({ id: 'c', name: 'C', postCount: 6 }),
  ]
  const plan = prepareXScheduledPost(state(summaries, 'database', {
    events: [
      { id: 'e1', storeId: 'a', date: '2026-07-16', weekday: '木曜', startsAt: '19:00', session: 'night', category: 'event', title: 'BINGO' },
      { id: 'e2', storeId: 'b', date: '2026-07-16', weekday: '木曜', startsAt: '13:00', session: 'day', category: 'event', title: '昼イベント' },
      { id: 'e3', storeId: 'c', date: '2026-07-16', weekday: '木曜', startsAt: '19:00', session: 'night', category: 'event', title: 'スタッフ誕生日' },
    ],
  }), 'tomorrow')

  assert.equal(plan.kind, 'tomorrow_forecast')
  assert.equal(plan.targetDateKey, '2026-07-16')
  assert.equal(plan.scheduledFor, '2026-07-15T14:00:00.000Z')
  assert.match(plan.text, /BINGO/)
  assert.match(plan.text, /7\/16\(木\)の予想/)
  assert.ok(plan.weightedLength <= 280)
})

test('tomorrow post falls back to a shorter complete format when live names are long', () => {
  const summaries = [
    summary({ id: 'a', name: 'Communicationbar 珊瑚 東京本店', postCount: 8 }),
    summary({ id: 'b', name: '荻窪秘密倶楽部スペシャルラウンジ', postCount: 7 }),
    summary({ id: 'c', name: 'CLUB SCARLET TOKYO ANNEX', postCount: 6 }),
  ]
  const plan = prepareXScheduledPost(state(summaries, 'database', {
    events: [
      { id: 'e1', storeId: 'a', date: '2026-07-16', weekday: '木曜', startsAt: '19:00', session: 'night', category: 'event', title: 'スペシャルBINGOナイト' },
      { id: 'e2', storeId: 'b', date: '2026-07-16', weekday: '木曜', startsAt: '13:00', session: 'day', category: 'event', title: 'スタッフ合同誕生日イベント' },
      { id: 'e3', storeId: 'c', date: '2026-07-16', weekday: '木曜', startsAt: '19:00', session: 'night', category: 'event', title: '月に一度の特別営業イベント' },
    ],
  }), 'tomorrow')

  assert.ok(plan.weightedLength <= 280)
  assert.match(plan.text, /🥇/)
  assert.match(plan.text, /🥈/)
  assert.match(plan.text, /🥉/)
  assert.match(plan.text, /🔥 アツすぎて滅/)
  assert.match(plan.text, /https:\/\/night-radar\.vercel\.app\/app/)
})

test('daily post is skipped unless three trustworthy stores are available', () => {
  assert.throws(
    () => prepareXDailyPost(state([
      summary({ id: 'a', name: 'A', postCount: 5 }),
      summary({ id: 'b', name: 'B', postCount: 4 }),
    ])),
    (error) => error instanceof XAutoPostPlanError && error.code === 'insufficient_reliable_stores',
  )
  assert.throws(
    () => prepareXDailyPost(state([], 'unavailable')),
    (error) => error instanceof XAutoPostPlanError && error.code === 'database_unavailable',
  )
})
