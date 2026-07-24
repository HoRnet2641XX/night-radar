import assert from 'node:assert/strict'
import test from 'node:test'
import type { PublicDirectoryState, PublicStoreSummary } from '@/lib/public-directory'
import {
  buildXCreateRequest,
  getXAutoPostConfig,
  inferXAutoPostSlot,
  parseXAutoPostSlot,
  prepareXDailyPost,
  prepareXScheduledPost,
  selectXDailyCandidates,
  selectXHiddenGemCandidates,
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
  femaleCount?: number
  genderSampleCount?: number
  todayEventCount?: number
}) {
  return {
    store: { id: input.id, name: input.name },
    recentPostCount: input.postCount,
    recentThreeHourCount: input.threeHourCount ?? 0,
    femalePostCount: input.femaleCount ?? 0,
    genderSampleCount: input.genderSampleCount ?? input.femaleCount ?? 0,
    estimatedVisitIntentCount: input.intentCount ?? input.postCount,
    todayEventCount: input.todayEventCount ?? 0,
    dataConfidence: input.confidence ?? 90,
    insight: {
      reliability: input.reliability ?? 'fresh',
      activity: { estimatedVisitIntentCount: input.intentCount ?? input.postCount },
    },
    source: { lastStatus: input.sourceStatus ?? 'ok' },
    point: { score: input.score ?? 70 },
  } as unknown as PublicStoreSummary
}

function hiddenSummaries() {
  return [
    summary({ id: 'hidden-a', name: 'HIDDEN A', postCount: 5, intentCount: 0, femaleCount: 3, genderSampleCount: 4 }),
    summary({ id: 'hidden-b', name: 'HIDDEN B', postCount: 4, intentCount: 0, femaleCount: 2, genderSampleCount: 3 }),
    summary({ id: 'hidden-c', name: 'HIDDEN C', postCount: 3, intentCount: 0, femaleCount: 1, genderSampleCount: 2 }),
  ]
}

function state(
  summaries: PublicStoreSummary[],
  mode: PublicDirectoryState['mode'] = 'database',
  overrides: Partial<PublicDirectoryState> = {},
) {
  const measuredStores = summaries
    .filter((item) => item.recentPostCount > 0)
    .toSorted((left, right) => right.recentPostCount - left.recentPostCount)
    .map((item, index) => {
      const postDelta = Math.max(1, Math.floor(item.recentPostCount / 2))
      const previousPostCount = Math.max(0, item.recentPostCount - postDelta)
      return {
        storeId: item.store.id,
        currentPostCount: item.recentPostCount,
        previousPostCount,
        postDelta,
        momentumPercent: 60,
        weekOverWeekRatio: previousPostCount ? Math.round((item.recentPostCount / previousPostCount) * 100) : null,
        changePercent: previousPostCount ? Math.round((postDelta / previousPostCount) * 100) : null,
        status: 'measured' as const,
        rank: index + 1,
      }
    })
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
      measuredStoreCount: measuredStores.length,
      newActivityStoreCount: 0,
      stores: measuredStores,
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
    targetUrl: 'https://night-radar.vercel.app/share',
    minimumDataConfidence: 60,
  })
})

test('X weighted length uses the transformed URL length', () => {
  assert.equal(xWeightedLength('A https://example.com/very/long/path B'), 27)
  assert.equal(xWeightedLength('今日'), 4)
})

test('X reply requests point to the previous post', () => {
  assert.deepEqual(buildXCreateRequest('先頭投稿'), { text: '先頭投稿' })
  assert.deepEqual(buildXCreateRequest('返信投稿', '12345'), {
    text: '返信投稿',
    reply: { in_reply_to_tweet_id: '12345' },
  })
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

  assert.equal(result.eligibleStoreCount, 5)
  assert.deepEqual(result.candidates.map((candidate) => candidate.storeId), ['i', 'e', 'a'])
})

test('midday post uses rank labels, is aggregate-only, and stays within the X limit', () => {
  const plan = prepareXDailyPost(state([
    summary({ id: 'filt', name: 'FILT SHIBUYA', postCount: 57 }),
    summary({ id: 'agreeable', name: 'AgreeAble', postCount: 33 }),
    summary({ id: 'face', name: 'BAR FACE', postCount: 20 }),
    ...hiddenSummaries(),
  ]), { includeUrl: true, targetUrl: 'https://night-radar.vercel.app/app' })

  assert.equal(plan.idempotencyKey, 'today_ranking:2026-07-15')
  assert.equal(plan.scheduledFor, '2026-07-15T03:00:00.000Z')
  const thread = plan.threadTexts.join('\n')
  const ogpReply = plan.threadTexts.at(-1) ?? ''
  assert.match(plan.text, /今夜|昼|店選び/)
  assert.match(thread, /本日の投稿数が多い店舗|現在、投稿が集まっている店舗|当日投稿の動きが大きい店舗/)
  assert.match(thread, /🥇\s+bar FILT SHIBUYA｜57件/)
  assert.match(thread, /7日前の同時刻より投稿が増えている店舗|先週の同時刻と比べて伸びている店舗|7日前比で動きが上向いている店舗/)
  assert.match(thread, /上位以外で確認しておきたい穴場店舗|比較候補として見ておきたい店舗|投稿内容から浮かんだ穴場店舗/)
  assert.match(thread, /🥇\s+bar HIDDEN A｜5件.*🥈\s+bar HIDDEN B｜4件.*🥉\s+bar HIDDEN C｜3件/s)
  assert.match(thread, /7\/15 18:00時点の各店の動向です/)
  assert.match(thread, /#ハプバー/)
  assert.doesNotMatch(plan.text, /https?:\/\//)
  assert.match(ogpReply, /^https:\/\/night-radar\.vercel\.app\/share\?[^\s]*report=2026-07-15-midday/)
  assert.doesNotMatch(thread, /絶対|満員確定|必ず盛り上がる/)
  assert.doesNotMatch(thread, /。/)
  assert.equal(plan.weeklyCandidates.length, 3)
  assert.equal(plan.eventHighlights.length, 2)
  assert.equal(plan.hiddenGemCandidates.length, 3)
  assert.deepEqual(plan.hiddenGemCandidates.map((item) => item.storeId), ['hidden-a', 'hidden-b', 'hidden-c'])
  assert.equal(new Set([...plan.candidates, ...plan.hiddenGemCandidates].map((item) => item.storeId)).size, 6)
  assert.doesNotMatch(thread, /投稿者|本文|author|body/)
  assert.equal(plan.text, plan.threadTexts[0])
  assert.deepEqual(plan.replyTexts, plan.threadTexts.slice(1))
  assert.ok(plan.threadTexts.length >= 3)
  assert.equal(plan.replyTexts.length, plan.threadTexts.length - 1)
  assert.equal(plan.replyTexts.at(-1), ogpReply)
  assert.match(ogpReply, /^https?:\/\/\S+$/)
  plan.threadTexts.slice(0, -1).forEach((post) => assert.doesNotMatch(post, /https?:\/\//))
  assert.ok(plan.weightedLengths.every((length) => length <= 280))
  assert.ok(plan.candidates.every((item) => item.storeName.startsWith('bar ')))
  assert.match(thread, /\n━━━━━━━━\n/)
  assert.match(thread, /本日の詳しいランキングは、次の投稿からご確認いただけます👇/)
})

test('hidden gems stay outside the headline top three and prefer lower-volume stores with evidence', () => {
  const summaries = [
    summary({ id: 'hot-a', name: 'HOT A', postCount: 30, femaleCount: 9, genderSampleCount: 12 }),
    summary({ id: 'hot-b', name: 'HOT B', postCount: 24, femaleCount: 7, genderSampleCount: 10 }),
    summary({ id: 'hot-c', name: 'HOT C', postCount: 20, femaleCount: 6, genderSampleCount: 9 }),
    summary({ id: 'gem-a', name: 'GEM A', postCount: 8, intentCount: 0, femaleCount: 4, genderSampleCount: 5 }),
    summary({ id: 'gem-b', name: 'GEM B', postCount: 6, intentCount: 0, femaleCount: 2, genderSampleCount: 3 }),
    summary({ id: 'gem-c', name: 'GEM C', postCount: 4, intentCount: 0, threeHourCount: 2 }),
    summary({ id: 'quiet', name: 'QUIET', postCount: 3, intentCount: 0 }),
  ]
  const result = selectXHiddenGemCandidates(summaries, new Set(['hot-a', 'hot-b', 'hot-c']))

  assert.equal(result.eligibleStoreCount, 3)
  assert.deepEqual(new Set(result.candidates.map((item) => item.storeId)), new Set(['gem-a', 'gem-b', 'gem-c']))
  assert.ok(result.candidates.every((item) => item.heatLabel === '👀 穴場'))
})

test('evening post ranks only stores with a measured positive change from exactly seven days earlier', () => {
  const summaries = [
    summary({ id: 'face', name: 'BAR FACE', postCount: 24 }),
    summary({ id: 'agreeable', name: 'AgreeAble', postCount: 18 }),
    summary({ id: 'retreat', name: 'RETREAT BAR', postCount: 16 }),
    summary({ id: 'flat', name: 'FLAT', postCount: 14 }),
    ...hiddenSummaries(),
  ]
  const plan = prepareXScheduledPost(state(summaries, 'database', {
    weeklyMomentum: {
      currentStartsAt: '', currentEndsAt: '', previousStartsAt: '', previousEndsAt: '',
      comparisonDayCount: 1,
      minimumComparisonCount: 3, measuredStoreCount: 4, newActivityStoreCount: 0,
      stores: [
        { storeId: 'face', currentPostCount: 24, previousPostCount: 12, postDelta: 12, momentumPercent: 67, weekOverWeekRatio: 200, changePercent: 100, status: 'measured', rank: 1 },
        { storeId: 'agreeable', currentPostCount: 18, previousPostCount: 10, postDelta: 8, momentumPercent: 64, weekOverWeekRatio: 180, changePercent: 80, status: 'measured', rank: 2 },
        { storeId: 'retreat', currentPostCount: 16, previousPostCount: 12, postDelta: 4, momentumPercent: 57, weekOverWeekRatio: 133, changePercent: 33, status: 'measured', rank: 3 },
        { storeId: 'flat', currentPostCount: 14, previousPostCount: 14, postDelta: 0, momentumPercent: 50, weekOverWeekRatio: 100, changePercent: 0, status: 'measured', rank: 4 },
      ],
    },
  }), 'evening')

  assert.equal(plan.kind, 'weekly_momentum')
  assert.equal(plan.candidates.length, 3)
  assert.equal(plan.weeklyCandidates.length, 3)
  const thread = plan.threadTexts.join('\n')
  assert.match(thread, /🥉\s+bar RETREAT BAR｜\+4件/)
  assert.match(thread, /7日前の同時刻より投稿が増えている店舗|先週の同時刻と比べて伸びている店舗|7日前比で動きが上向いている店舗/)
  assert.match(thread, /上位以外で確認しておきたい穴場店舗|比較候補として見ておきたい店舗|投稿内容から浮かんだ穴場店舗/)
  assert.ok(plan.threadTexts.length >= 3)
  assert.match(plan.threadTexts.at(-1) ?? '', /^https?:\/\/\S+$/)
  assert.ok(plan.weightedLengths.every((length) => length <= 280))
})

test('tomorrow post keeps current rankings and highlights tomorrow events for the top two stores', () => {
  const summaries = [
    summary({ id: 'a', name: 'A', postCount: 8 }),
    summary({ id: 'b', name: 'B', postCount: 7 }),
    summary({ id: 'c', name: 'C', postCount: 6 }),
    ...hiddenSummaries(),
  ]
  const plan = prepareXScheduledPost(state(summaries, 'database', {
    events: [
      { id: 'e1', storeId: 'a', date: '2026-07-16', weekday: '木曜', startsAt: '19:00', session: 'night', category: 'event', title: 'BINGO' },
      { id: 'e2', storeId: 'b', date: '2026-07-16', weekday: '木曜', startsAt: '13:00', session: 'day', category: 'event', title: 'スーツ割引DAY' },
      { id: 'e3', storeId: 'c', date: '2026-07-16', weekday: '木曜', startsAt: '19:00', session: 'night', category: 'event', title: 'スタッフ誕生日' },
    ],
  }), 'tomorrow')

  assert.equal(plan.kind, 'tomorrow_forecast')
  assert.equal(plan.targetDateKey, '2026-07-16')
  assert.equal(plan.scheduledFor, '2026-07-15T14:00:00.000Z')
  const thread = plan.threadTexts.join('\n')
  assert.match(thread, /明日のイベント情報|明日の注目イベント|明日のイベント予定/)
  assert.match(thread, /bar A.*BINGO/)
  assert.match(thread, /bar B.*スーツ割引DAY/)
  assert.doesNotMatch(thread, /スタッフ誕生日/)
  assert.match(thread, /7\/15 18:00時点の各店の動向です/)
  assert.match(thread, /上位以外で確認しておきたい穴場店舗|比較候補として見ておきたい店舗|投稿内容から浮かんだ穴場店舗/)
  assert.equal(plan.spotlightEvent?.storeId, 'a')
  assert.match(thread, /明日の注目トピック/)
  assert.ok(plan.threadTexts.length >= 3)
  assert.match(plan.threadTexts.at(-1) ?? '', /^https?:\/\/\S+$/)
  assert.ok(plan.weightedLengths.every((length) => length <= 280))
})

test('tomorrow post falls back to a shorter complete format when live names are long', () => {
  const summaries = [
    summary({ id: 'a', name: 'Communicationbar 珊瑚 東京本店', postCount: 8 }),
    summary({ id: 'b', name: '荻窪秘密倶楽部スペシャルラウンジ', postCount: 7 }),
    summary({ id: 'c', name: 'CLUB SCARLET TOKYO ANNEX', postCount: 6 }),
    summary({ id: 'hidden-a', name: 'Secret comparison candidate eastern branch', postCount: 5, intentCount: 0, femaleCount: 3 }),
    summary({ id: 'hidden-b', name: 'Another very long hidden bar candidate', postCount: 4, intentCount: 0, femaleCount: 2 }),
    summary({ id: 'hidden-c', name: 'Third extended hidden store candidate', postCount: 3, intentCount: 0, femaleCount: 1 }),
  ]
  const plan = prepareXScheduledPost(state(summaries, 'database', {
    events: [
      { id: 'e1', storeId: 'a', date: '2026-07-16', weekday: '木曜', startsAt: '19:00', session: 'night', category: 'event', title: 'スペシャルBINGOナイト' },
      { id: 'e2', storeId: 'b', date: '2026-07-16', weekday: '木曜', startsAt: '13:00', session: 'day', category: 'event', title: 'スタッフ合同誕生日イベント' },
      { id: 'e3', storeId: 'c', date: '2026-07-16', weekday: '木曜', startsAt: '19:00', session: 'night', category: 'event', title: '月に一度の特別営業イベント' },
    ],
  }), 'tomorrow')

  const thread = plan.threadTexts.join('\n')
  assert.ok(plan.weightedLengths.every((length) => length <= 280))
  assert.match(thread, /🥇/)
  assert.match(thread, /🥈/)
  assert.match(thread, /🥉/)
  assert.match(thread, /bar Communicationbar 珊瑚 東京本店/)
  assert.match(thread, /bar 荻窪秘密倶楽部スペシャルラウンジ/)
  assert.match(thread, /bar CLUB SCARLET TOKYO ANNEX/)
  assert.match(thread, /本日の投稿数が多い店舗|現在、投稿が集まっている店舗|当日投稿の動きが大きい店舗/)
  assert.match(thread, /7日前の同時刻より投稿が増えている店舗|先週の同時刻と比べて伸びている店舗|7日前比で動きが上向いている店舗/)
  assert.match(thread, /上位以外で確認しておきたい穴場店舗|比較候補として見ておきたい店舗|投稿内容から浮かんだ穴場店舗/)
  assert.match(thread, /スペシャルBINGOナイト/)
  assert.match(thread, /スタッフ合同誕生日イベント/)
  assert.match(thread, /#ハプバー/)
  assert.ok(plan.threadTexts.length >= 3)
  assert.match(plan.threadTexts.at(-1) ?? '', /^https?:\/\/\S+$/)
  assert.match(thread, /https:\/\/night-radar\.vercel\.app\/share\?[^\s]*report=2026-07-16-tomorrow/)
})

test('tomorrow post spotlights the official RETREAT BAR summer festival before the OGP reply', () => {
  const summaries = [
    summary({ id: 'filt', name: 'FILT SHIBUYA', postCount: 18 }),
    summary({ id: 'canelo', name: 'BAR CANELO', postCount: 14 }),
    summary({ id: 'agreeable', name: 'AgreeAble', postCount: 12 }),
    summary({ id: 'retreat-bar', name: 'RETREAT BAR', postCount: 8 }),
    ...hiddenSummaries(),
  ]
  const plan = prepareXScheduledPost(state(summaries, 'database', {
    generatedAt: '2026-07-23T14:52:00.000Z',
    events: [
      { id: 'filt-event', storeId: 'filt', date: '2026-07-25', weekday: '土曜', startsAt: '19:00', session: 'night', category: 'event', title: '週末イベント' },
      { id: 'canelo-event', storeId: 'canelo', date: '2026-07-25', weekday: '土曜', startsAt: '19:00', session: 'night', category: 'event', title: '週末イベント' },
      { id: 'retreat-event', storeId: 'retreat-bar', date: '2026-07-25', weekday: '土曜', startsAt: '19:00', session: 'night', category: 'event', title: '2026.夏のBIGイベント！「夏フェス！！」開催' },
    ],
  }), 'tomorrow', { referenceTime: '2026-07-24T06:00:00.000Z' })

  const thread = plan.threadTexts.join('\n')
  const ogpReply = plan.threadTexts.at(-1) ?? ''
  assert.equal(plan.targetDateKey, '2026-07-25')
  assert.equal(plan.sourceGeneratedAt, '2026-07-23T14:52:00.000Z')
  assert.equal(plan.spotlightEvent?.storeId, 'retreat-bar')
  assert.match(thread, /🔎明日の注目トピック/)
  assert.match(thread, /bar RETREAT BAR/)
  assert.match(thread, /夏フェス/)
  assert.match(thread, /23時から大抽選会/)
  assert.equal(plan.replyTexts.at(-1), ogpReply)
  assert.match(ogpReply, /^https?:\/\/\S+$/)
  assert.ok(plan.weightedLengths.every((length) => length <= 280))
})

test('scheduled copy variation is deterministic for retries in the same slot', () => {
  const currentState = state([
    summary({ id: 'filt', name: 'FILT SHIBUYA', postCount: 57 }),
    summary({ id: 'agreeable', name: 'AgreeAble', postCount: 33 }),
    summary({ id: 'face', name: 'BAR FACE', postCount: 20 }),
    ...hiddenSummaries(),
  ])
  const first = prepareXDailyPost(currentState)
  const retry = prepareXDailyPost(currentState)

  assert.equal(first.text, retry.text)
  assert.deepEqual(first.threadTexts, retry.threadTexts)
  assert.equal(first.contentHash, retry.contentHash)
})

test('scheduled titles vary across dates without changing during a retry', () => {
  const summaries = [
    summary({ id: 'filt', name: 'FILT SHIBUYA', postCount: 57 }),
    summary({ id: 'agreeable', name: 'AgreeAble', postCount: 33 }),
    summary({ id: 'face', name: 'BAR FACE', postCount: 20 }),
    ...hiddenSummaries(),
  ]
  const titles = new Set(Array.from({ length: 7 }, (_, offset) => {
    const generatedAt = new Date(Date.UTC(2026, 6, 15 + offset, 9)).toISOString()
    return prepareXDailyPost(state(summaries, 'database', { generatedAt })).text.split('\n')[0]
  }))

  assert.ok(titles.size >= 2)
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
