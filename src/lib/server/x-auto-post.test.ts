import assert from 'node:assert/strict'
import test from 'node:test'
import type { PublicDirectoryState, PublicStoreSummary } from '@/lib/public-directory'
import {
  getXAutoPostConfig,
  prepareXDailyPost,
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
}) {
  return {
    store: { id: input.id, name: input.name },
    recentPostCount: input.postCount,
    recentThreeHourCount: input.threeHourCount ?? 0,
    dataConfidence: input.confidence ?? 90,
    insight: { reliability: input.reliability ?? 'fresh' },
    source: { lastStatus: input.sourceStatus ?? 'ok' },
    point: { score: input.score ?? 70 },
  } as unknown as PublicStoreSummary
}

function state(summaries: PublicStoreSummary[], mode: PublicDirectoryState['mode'] = 'database') {
  return {
    mode,
    stores: [],
    events: [],
    sources: [],
    normalizedPosts: [],
    weeklyMomentum: {
      currentStartsAt: '',
      currentEndsAt: '',
      previousStartsAt: '',
      previousEndsAt: '',
      minimumComparisonCount: 0,
      measuredStoreCount: 0,
      newActivityStoreCount: 0,
      stores: [],
    },
    dailyInsights: [],
    summaries,
    generatedAt: '2026-07-15T09:00:00.000Z',
  } satisfies PublicDirectoryState
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

test('daily candidates use only fresh, successful, sufficiently reliable store aggregates', () => {
  const result = selectXDailyCandidates([
    summary({ id: 'a', name: 'A', postCount: 8, threeHourCount: 2 }),
    summary({ id: 'b', name: 'B', postCount: 12, confidence: 59 }),
    summary({ id: 'c', name: 'C', postCount: 10, reliability: 'stale' }),
    summary({ id: 'd', name: 'D', postCount: 9, sourceStatus: 'failed' }),
    summary({ id: 'e', name: 'E', postCount: 15, threeHourCount: 4 }),
    summary({ id: 'f', name: 'F', postCount: 0 }),
    summary({ id: 'g', name: 'G', postCount: 6, threeHourCount: 6 }),
    summary({ id: 'h', name: 'H', postCount: 5 }),
  ], 60)

  assert.equal(result.eligibleStoreCount, 4)
  assert.deepEqual(result.candidates.map((candidate) => candidate.storeId), ['e', 'a', 'g'])
})

test('daily post is aggregate-only, deduplicated by Japan date, and within the X limit', () => {
  const plan = prepareXDailyPost(state([
    summary({ id: 'filt', name: 'FILT SHIBUYA', postCount: 57 }),
    summary({ id: 'agreeable', name: 'AgreeAble', postCount: 33 }),
    summary({ id: 'face', name: 'BAR FACE', postCount: 20 }),
  ]), { includeUrl: true, targetUrl: 'https://night-radar.vercel.app/app' })

  assert.equal(plan.idempotencyKey, 'daily-ranking:2026-07-15:18')
  assert.equal(plan.scheduledFor, '2026-07-15T09:00:00.000Z')
  assert.match(plan.text, /1位 bar FILT SHIBUYA 57件/)
  assert.match(plan.text, /店内人数ではありません/)
  assert.doesNotMatch(plan.text, /投稿者|本文|author|body/)
  assert.ok(plan.weightedLength <= 280)
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
