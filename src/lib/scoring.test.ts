import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { BbsNormalizedPost, BbsSnapshot, BbsSnapshotMetrics, EventInput, PostRecord, ScoredEvent, StoreProfile } from './types'
import { events, posts, stores } from './demo-data'
import { formatEventDateLabel, weekdayLabelForJapanDate } from './date'
import {
  buildBbsSnapshotMetrics,
  buildEffectiveBbsPostRecords,
  buildSearchableBbsRecords,
  buildStoreBbsAnalytics,
  buildStoreRadarPoints,
  buildVisitForecasts,
  buildWatchedWordHits,
  extractCustomerBbsText,
  extractNormalizedBbsPostsFromText,
  extractWatchedAuthorEntries,
  extractWatchedAuthorText,
  filterPostsForBusinessDay,
  filterPostsForStoreBusinessWindows,
  filterPostsWithinHours,
  filterSnapshotsForBusinessDay,
  filterSnapshotsForStoreBusinessWindows,
  inferStoreBusinessWindows,
  isExplicitlyEmptyBbsText,
  isSuspiciousNormalizedPostDrop,
  isStructurallyValidCustomerNormalizedPost,
  normalizeWatchedSearchText,
  normalizedBbsParseStatus,
  parseExactTerms,
  postDecisionDateKey,
  prioritizeScoredEventsForToday,
  resolvedNormalizedPostGender,
  scoreBbsSnapshot,
  scoreEvents,
  searchExactBbsTerms,
  summarizeSignals,
} from './scoring'

it('resolves explicit gender markers in author names without guessing ordinary names', () => {
  assert.equal(resolvedNormalizedPostGender({ authorName: '尋〜Hiro〜👩', authorGender: '記載なし' }), 'female')
  assert.equal(resolvedNormalizedPostGender({ authorName: 'くるちゃん👱‍♀️', authorGender: '記載なし' }), 'female')
  assert.equal(resolvedNormalizedPostGender({ authorName: 'タロウ（男性）', authorGender: '記載なし' }), 'male')
  assert.equal(resolvedNormalizedPostGender({ authorName: 'あやか', authorGender: '記載なし' }), 'unknown')
})

it('distinguishes an empty board from a parser that rejected every extracted post', () => {
  assert.equal(normalizedBbsParseStatus(0, 0), 'empty')
  assert.equal(normalizedBbsParseStatus(0, 0, true), 'failed')
  assert.equal(normalizedBbsParseStatus(4, 0), 'failed')
  assert.equal(normalizedBbsParseStatus(4, 3), 'ok')
  assert.equal(isExplicitlyEmptyBbsText('本日のご来店予告: 0 人'), true)
  assert.equal(isExplicitlyEmptyBbsText('来店予告 (0)'), true)
  assert.equal(isExplicitlyEmptyBbsText('来店予告を書き込む'), false)
  assert.equal(
    isExplicitlyEmptyBbsText('本日のご来店予告: 0 人\n投稿者: なお\n2026/07/14 12:30\n今夜行きます', 1),
    false,
  )
})

it('detects a sudden parser-count drop without flagging normal small-board changes', () => {
  assert.equal(isSuspiciousNormalizedPostDrop(7, 30), true)
  assert.equal(isSuspiciousNormalizedPostDrop(11, 30), false)
  assert.equal(isSuspiciousNormalizedPostDrop(2, 7), false)
  assert.equal(isSuspiciousNormalizedPostDrop(0, 30), false)
  assert.equal(isSuspiciousNormalizedPostDrop(10, 40, { maximumRatio: 0.25 }), true)
})

it('keeps today wording on the active business date after midnight and ignores duration-like day numbers', () => {
  const base = {
    id: 'after-midnight',
    storeId: 'agreeable',
    source: 'scrape' as const,
    postedAt: '2026-07-12T18:55:00.000Z',
    keywords: [],
  }
  assert.equal(postDecisionDateKey({ ...base, body: '本日行きます。' }), '2026-07-12')
  assert.equal(postDecisionDateKey({ ...base, body: '2日ぶりに今日行きます。' }), '2026-07-12')
  assert.equal(postDecisionDateKey({ ...base, body: '1日中遊べそうなので今夜伺います。' }), '2026-07-12')
  assert.equal(postDecisionDateKey({ ...base, body: '13日のお昼に行きます。' }), '2026-07-13')
  assert.equal(postDecisionDateKey({ ...base, body: '2-3人で今夜伺います。' }), '2026-07-12')
  assert.equal(postDecisionDateKey({ ...base, body: '19-23時ごろ滞在予定です。' }), '2026-07-12')
  assert.equal(postDecisionDateKey({ ...base, body: '7/13に伺います。' }), '2026-07-13')
})

describe('Japan calendar dates', () => {
  it('uses the opened calendar date to derive the weekday', () => {
    assert.equal(weekdayLabelForJapanDate(2026, 6, 29), '月曜')
    assert.equal(formatEventDateLabel({ date: '2026-06-29', weekday: '日曜' }), '6/29(月)')
  })
})

describe('scoreEvents', () => {
  it('ranks events and attaches store metrics', () => {
    const scored = scoreEvents(events, stores, posts)

    assert.equal(scored.length, events.length)
    assert.equal(scored[0].rank, 1)
    assert.ok(scored[0].score >= (scored.at(-1)?.score ?? 0))
    assert.ok(scored[0].store.name)
    assert.ok(scored[0].metrics.postCount > 0)
  })

  it('keeps score differences when official event content is the main signal', () => {
    const store = {
      ...stores[0],
      id: 'official-only-store',
      strongDays: [],
      strongEvents: [],
      weakEvents: [],
      trustSeed: 60,
    }
    const officialOnlyEvents: EventInput[] = [
      {
        id: 'event-detailed',
        storeId: store.id,
        date: '2026-06-20',
        weekday: '土曜',
        startsAt: '13:00',
        session: 'day',
        category: 'イベント',
        title: '女性無料 初参加歓迎の昼イベント',
        details: '13時から開催。女性無料、初めての方歓迎、予約参加と人数の条件が具体的。',
      },
      {
        id: 'event-plain',
        storeId: store.id,
        date: '2026-06-20',
        weekday: '土曜',
        startsAt: '13:00',
        session: 'day',
        category: 'イベント',
        title: '通常営業',
      },
    ]

    const scored = scoreEvents(officialOnlyEvents, [store], [])
    const scores = scored.map((event) => event.score)

    assert.ok(new Set(scores).size > 1)
    assert.equal(scored[0].id, 'event-detailed')
  })

  it('derives weekdays from ISO event dates before scoring', () => {
    const store = {
      ...stores[0],
      id: 'weekday-linked-store',
      strongDays: ['土曜'],
      strongEvents: [],
      weakEvents: [],
    }
    const event: EventInput = {
      id: 'event-wrong-weekday',
      storeId: store.id,
      date: '2026-06-13',
      weekday: '月曜',
      startsAt: '19:00',
      session: 'night',
      category: '通常',
      title: '曜日連動テスト',
    }

    const scored = scoreEvents([event], [store], [])

    assert.equal(scored[0].weekday, '土曜')
    assert.equal(scored[0].reasons[0], '土曜との相性が高い')
  })

  it('shows the derived weekday in visit forecast date labels', () => {
    const store = {
      ...stores[0],
      id: 'forecast-weekday-store',
      strongDays: ['土曜'],
    }
    const event: EventInput = {
      id: 'forecast-wrong-weekday',
      storeId: store.id,
      date: '2026-06-13',
      weekday: '月曜',
      startsAt: '19:00',
      session: 'night',
      category: '通常',
      title: '予測曜日テスト',
    }

    const forecasts = buildVisitForecasts([event], [store], [])

    assert.equal(forecasts[0].dateLabel, '6/13(土)')
  })

  it('prioritizes today on the TOP summary even when tomorrow has a higher raw score', () => {
    const store = stores[0]
    const todayEvent = {
      id: 'today-saturday-event',
      storeId: store.id,
      date: '2026-07-04',
      weekday: '土曜',
      startsAt: '19:00',
      session: 'night',
      category: '通常',
      title: '今日の候補',
      score: 72,
      rank: 2,
      tone: 'warm',
      paidOnly: false,
      store,
      metrics: {},
      reasons: ['土曜との相性が高い'],
    } as ScoredEvent
    const tomorrowEvent = {
      ...todayEvent,
      id: 'tomorrow-sunday-event',
      date: '2026-07-05',
      weekday: '日曜',
      title: '明日の高得点候補',
      score: 99,
      rank: 1,
      reasons: ['日曜との相性が高い'],
    } as ScoredEvent
    const referenceDate = new Date('2026-07-03T15:30:00.000Z')

    assert.equal(prioritizeScoredEventsForToday([tomorrowEvent, todayEvent], { referenceDate })[0].id, 'today-saturday-event')
    assert.equal(summarizeSignals([tomorrowEvent, todayEvent], { referenceDate }).nightTop?.id, 'today-saturday-event')
  })

  it('prioritizes today on visit forecasts before high-score future events', () => {
    const store = stores[0]
    const todayEvent: EventInput = {
      id: 'forecast-today-event',
      storeId: store.id,
      date: '2026-07-04',
      weekday: '土曜',
      startsAt: '19:00',
      session: 'night',
      category: '通常営業',
      title: '今日の予測候補',
    }
    const futureEvent: EventInput = {
      id: 'forecast-future-event',
      storeId: store.id,
      date: '2026-07-05',
      weekday: '日曜',
      startsAt: '19:00',
      session: 'night',
      category: '女性無料 初めて歓迎',
      title: '明日の高得点候補',
      details: '女性無料、初めて歓迎、予約参加、人数条件が具体的な高得点イベント。',
    }
    const referenceDate = new Date('2026-07-03T15:30:00.000Z')

    const forecasts = buildVisitForecasts([futureEvent, todayEvent], [store], [], { referenceDate, windowDays: 14 })

    assert.equal(forecasts[0].id, 'forecast-today-event')
    assert.equal(forecasts[0].dateLabel, '7/4(土)')
  })
})

describe('buildStoreBbsAnalytics', () => {
  it('builds weekday ratios for every store', () => {
    const analytics = buildStoreBbsAnalytics(stores, posts)

    assert.equal(analytics.length, stores.length)
    assert.equal(analytics[0].weekdayStats.length, 7)
    assert.ok(analytics[0].excitement >= 0)
    assert.ok(analytics[0].excitement <= 100)
  })
})

describe('searchExactBbsTerms', () => {
  it('finds exact Japanese terms without fuzzy matching', () => {
    const matches = searchExactBbsTerms(
      [
        {
          id: 'author-name-post',
          storeId: stores[0].id,
          source: 'scrape',
          postedAt: '2026-06-13T12:00:00.000Z',
          body: '投稿者：人気単男A（男性） 本日行きます。',
          keywords: [],
        },
      ],
      stores,
      [
        {
          group: 'popularSingleMale',
          label: '人気単独男性',
          terms: parseExactTerms('人気単男A\n存在しない語'),
        },
      ],
    )

    assert.equal(matches.length, 1)
    assert.equal(matches.every((match) => match.term === '人気単男A'), true)
  })

  it('does not match exact monitored terms from the post body', () => {
    const matches = searchExactBbsTerms(
      [
        {
          id: 'body-false-positive-post',
          storeId: stores[0].id,
          source: 'scrape',
          postedAt: '2026-07-02T03:30:00.000Z',
          body: '投稿者：しゅーー（男性） ほなすぐいくわー',
          keywords: [],
        },
      ],
      stores,
      [
        {
          group: 'popularSingleMale',
          label: '人気単独男性',
          terms: parseExactTerms('なす'),
        },
      ],
    )

    assert.equal(matches.length, 0)
  })

  it('normalizes full-width characters and whitespace for exact term matching', () => {
    const matches = searchExactBbsTerms(
      [
        {
          id: 'normalized-post',
          storeId: stores[0].id,
          source: 'manual',
          postedAt: '2026-06-13T12:00:00.000Z',
          body: '投稿者：人気 単男 A（男性） が反応しました。',
          keywords: [],
        },
      ],
      stores,
      [
        {
          group: 'popularSingleMale',
          label: '人気単独男性',
          terms: parseExactTerms('人気単男Ａ'),
        },
      ],
    )

    assert.equal(matches.length, 1)
    assert.equal(matches[0].term, '人気単男A')
  })

  it('searches full BBS snapshot text in addition to truncated scrape posts', () => {
    const longBody = `${'通常テキスト'.repeat(180)} 投稿者：人気単女Z（女性） が来店予告しました。`
    const searchableRecords = buildSearchableBbsRecords(
      [
        {
          id: 'truncated-scrape-post',
          storeId: stores[0].id,
          source: 'scrape',
          postedAt: '2026-06-13T12:00:00.000Z',
          body: longBody.slice(0, 1500),
          keywords: [],
        },
      ],
      [
        {
          id: 'full-snapshot',
          storeId: stores[0].id,
          url: 'https://example.com/bbs',
          extractedText: longBody,
          metrics: {
            femaleOnly: 0,
            firstVisit: 0,
            comeback: 0,
            groupVisit: 0,
            emoji: 0,
            totalSignals: 0,
            textLength: longBody.length,
          },
          radarScore: 60,
          capturedAt: '2026-06-13T12:05:00.000Z',
        },
      ],
    )

    const matches = searchExactBbsTerms(searchableRecords, stores, [
      {
        group: 'popularSingleFemale',
        label: '人気単独女性',
        terms: parseExactTerms('人気単女Z'),
      },
    ])

    assert.equal(matches.length, 1)
    assert.equal(matches[0].post.id, 'snapshot-full-snapshot')
  })

  it('filters monitored searches to the requested recent window', () => {
    const records: PostRecord[] = [
      {
        id: 'recent-author',
        storeId: stores[0].id,
        source: 'scrape',
        postedAt: '2026-07-02T03:30:00.000Z',
        body: '投稿者：なす（男性） 行きます。',
        keywords: [],
      },
      {
        id: 'old-author',
        storeId: stores[0].id,
        source: 'scrape',
        postedAt: '2026-06-28T12:30:00.000Z',
        body: '投稿者：なす（男性） 行きます。',
        keywords: [],
      },
    ]

    const recentRecords = filterPostsWithinHours(records, '2026-07-02T04:00:00.000Z', 24)
    const matches = searchExactBbsTerms(recentRecords, stores, [
      {
        group: 'popularSingleMale',
        label: '人気単独男性',
        terms: parseExactTerms('なす'),
      },
    ])

    assert.deepEqual(
      matches.map((match) => match.post.id),
      ['recent-author'],
    )
  })
})

describe('BBS radar signals', () => {
  it('filters posts to the current Japan business day', () => {
    const records: PostRecord[] = [
      {
        id: 'previous-business-start',
        storeId: stores[0].id,
        source: 'scrape',
        postedAt: '2026-07-01T21:10:00.000Z',
        body: '営業日開始後の投稿',
        keywords: [],
      },
      {
        id: 'same-business-night',
        storeId: stores[0].id,
        source: 'scrape',
        postedAt: '2026-07-02T01:00:00.000Z',
        body: '深夜営業中の投稿',
        keywords: [],
      },
      {
        id: 'before-business-start',
        storeId: stores[0].id,
        source: 'scrape',
        postedAt: '2026-07-01T20:50:00.000Z',
        body: '営業日前の投稿',
        keywords: [],
      },
      {
        id: 'future-post',
        storeId: stores[0].id,
        source: 'scrape',
        postedAt: '2026-07-02T03:30:00.000Z',
        body: 'まだ取得時刻より未来の投稿',
        keywords: [],
      },
    ]

    const filtered = filterPostsForBusinessDay(records, '2026-07-02T02:00:00.000Z')

    assert.deepEqual(
      filtered.map((record) => record.id),
      ['previous-business-start', 'same-business-night'],
    )
  })

  it('filters BBS snapshots to the current Japan business day', () => {
    const snapshots: BbsSnapshot[] = [
      {
        id: 'today-snapshot',
        sourceId: 'source-1',
        storeId: stores[0].id,
        url: 'https://example.com/bbs',
        extractedText: '',
        metrics: { femaleOnly: 1, firstVisit: 0, comeback: 0, groupVisit: 0, emoji: 0, totalSignals: 1, textLength: 100 },
        radarScore: 44,
        capturedAt: '2026-07-01T21:05:00.000Z',
      },
      {
        id: 'old-snapshot',
        sourceId: 'source-1',
        storeId: stores[0].id,
        url: 'https://example.com/bbs',
        extractedText: '',
        metrics: { femaleOnly: 9, firstVisit: 0, comeback: 0, groupVisit: 0, emoji: 0, totalSignals: 9, textLength: 900 },
        radarScore: 92,
        capturedAt: '2026-07-01T20:55:00.000Z',
      },
    ]

    const filtered = filterSnapshotsForBusinessDay(snapshots, '2026-07-02T02:00:00.000Z')

    assert.deepEqual(
      filtered.map((snapshot) => snapshot.id),
      ['today-snapshot'],
    )
  })

  it('filters posts by the active store session instead of a fixed day boundary', () => {
    const store: StoreProfile = {
      ...stores[0],
      id: 'active-session-store',
      hasDaytime: true,
      hasNight: true,
      openingHourDay: '13:00',
      openingHourNight: '19:00',
    }
    const records: PostRecord[] = [
      {
        id: 'day-post',
        storeId: store.id,
        source: 'scrape',
        postedAt: '2026-07-02T07:00:00.000Z',
        body: '昼部の投稿',
        keywords: [],
      },
      {
        id: 'night-post',
        storeId: store.id,
        source: 'scrape',
        postedAt: '2026-07-02T11:00:00.000Z',
        body: '夜部の投稿',
        keywords: [],
      },
      {
        id: 'future-night-post',
        storeId: store.id,
        source: 'scrape',
        postedAt: '2026-07-02T14:00:00.000Z',
        body: 'まだ未来の夜部投稿',
        keywords: [],
      },
    ]

    const filtered = filterPostsForStoreBusinessWindows(records, [store], '2026-07-02T13:00:00.000Z')

    assert.deepEqual(
      filtered.map((record) => record.id),
      ['night-post'],
    )
  })

  it('keeps the previous-date night session when the reference time is after midnight in Japan', () => {
    const store: StoreProfile = {
      ...stores[0],
      id: 'cross-midnight-store',
      hasDaytime: false,
      hasNight: true,
      openingHourDay: '',
      openingHourNight: '19:00',
    }
    const records: PostRecord[] = [
      {
        id: 'before-night',
        storeId: store.id,
        source: 'scrape',
        postedAt: '2026-07-01T07:00:00.000Z',
        body: '夜部前の投稿',
        keywords: [],
      },
      {
        id: 'previous-night',
        storeId: store.id,
        source: 'scrape',
        postedAt: '2026-07-01T15:00:00.000Z',
        body: '深夜帯の投稿',
        keywords: [],
      },
    ]

    const filtered = filterPostsForStoreBusinessWindows(records, [store], '2026-07-01T17:00:00.000Z')

    assert.deepEqual(
      filtered.map((record) => record.id),
      ['previous-night'],
    )
  })

  it('uses the upcoming same-date session after the previous night has closed', () => {
    const store: StoreProfile = {
      ...stores[0],
      id: 'upcoming-night-store',
      hasDaytime: false,
      hasNight: true,
      openingHourDay: '',
      openingHourNight: '19:00',
    }

    const windows = inferStoreBusinessWindows(store, '2026-07-12T03:00:00.000Z')

    assert.equal(windows.length, 1)
    assert.equal(new Date(windows[0].start).toISOString(), '2026-07-12T10:00:00.000Z')
    assert.equal(new Date(windows[0].end).toISOString(), '2026-07-12T20:00:00.000Z')
  })

  it('uses the next same-date session between daytime and night sessions', () => {
    const store: StoreProfile = {
      ...stores[0],
      id: 'split-session-store',
      hasDaytime: true,
      hasNight: true,
      openingHourDay: '13:00',
      openingHourNight: '20:00',
    }

    const windows = inferStoreBusinessWindows(store, '2026-07-12T10:30:00.000Z')

    assert.equal(windows.length, 1)
    assert.equal(windows[0].label, '夜部')
    assert.equal(new Date(windows[0].start).toISOString(), '2026-07-12T11:00:00.000Z')
  })

  it('prefers irregular BBS schedule text such as morning sessions over the store defaults', () => {
    const store: StoreProfile = {
      ...stores[0],
      id: 'morning-session-store',
      hasDaytime: true,
      hasNight: false,
      openingHourDay: '13:00',
      openingHourNight: '',
    }
    const records: PostRecord[] = [
      {
        id: 'before-morning',
        storeId: store.id,
        source: 'scrape',
        postedAt: '2026-07-02T00:45:00.000Z',
        body: '朝活前の投稿',
        keywords: [],
      },
      {
        id: 'morning-post',
        storeId: store.id,
        source: 'scrape',
        postedAt: '2026-07-02T01:15:00.000Z',
        body: '朝活に向かいます',
        keywords: [],
      },
    ]
    const snapshots: BbsSnapshot[] = [
      {
        id: 'morning-schedule',
        storeId: store.id,
        url: 'https://example.com/bbs',
        extractedText: '本日の朝活は10:00-19:00で開催します。夜部はありません。',
        metrics: { femaleOnly: 0, firstVisit: 0, comeback: 0, groupVisit: 0, emoji: 0, totalSignals: 0, textLength: 24 },
        radarScore: 50,
        capturedAt: '2026-07-02T01:10:00.000Z',
      },
    ]

    const filteredPosts = filterPostsForStoreBusinessWindows(records, [store], '2026-07-02T02:00:00.000Z', snapshots)
    const filteredSnapshots = filterSnapshotsForStoreBusinessWindows(snapshots, [store], '2026-07-02T02:00:00.000Z', records)

    assert.deepEqual(
      filteredPosts.map((record) => record.id),
      ['morning-post'],
    )
    assert.deepEqual(
      filteredSnapshots.map((snapshot) => snapshot.id),
      ['morning-schedule'],
    )
  })

  it('does not treat an event time range as store business hours', () => {
    const store: StoreProfile = {
      ...stores[0],
      id: 'night-only-store',
      hasDaytime: false,
      hasNight: true,
      openingHourDay: '',
      openingHourNight: '19:00',
    }
    const records: PostRecord[] = [
      {
        id: 'event-time-post',
        storeId: store.id,
        source: 'scrape',
        postedAt: '2026-07-02T06:00:00.000Z',
        body: '午後の投稿',
        keywords: [],
      },
    ]
    const snapshots: BbsSnapshot[] = [
      {
        id: 'event-time-snapshot',
        storeId: store.id,
        url: 'https://example.com/bbs',
        extractedText: '抽選イベントは14:00-16:00で開催します。',
        metrics: { femaleOnly: 0, firstVisit: 0, comeback: 0, groupVisit: 0, emoji: 0, totalSignals: 0, textLength: 24 },
        radarScore: 50,
        capturedAt: '2026-07-02T06:10:00.000Z',
      },
    ]

    const filtered = filterPostsForStoreBusinessWindows(records, [store], '2026-07-02T06:30:00.000Z', snapshots)

    assert.deepEqual(filtered, [])
  })

  it('extracts customer-written BBS blocks from noisy public pages', () => {
    const text = [
      '禁止事項 BBSでの誹謗中傷や営業妨害は禁止です。当店イベントは女性無料です。',
      '投稿者：サトル 初めて行きます。どなたか一緒に乾杯できたら嬉しいです。',
      '投稿者：店長 本日は19時からイベント開催です。料金とシステムをご確認ください。',
      'No.2304 Yuki 久しぶりに伺います。よろしくお願いします。',
    ].join(' ')

    const extracted = extractCustomerBbsText(text)

    assert.match(extracted, /サトル/)
    assert.match(extracted, /Yuki/)
    assert.doesNotMatch(extracted, /禁止事項/)
    assert.doesNotMatch(extracted, /店長/)
  })

  it('excludes store announcement posts even when they contain watched words', () => {
    const text = [
      '投稿者：HoneyTrap 【昼の部】 13時〜19時（ニップレス＆レディースday）ハニトラがとうとう限界に挑戦！',
      '来店予告された単独女性様には嬉しい特典があります。初めての方も登録手数料無料、入場料半額です。',
      '投稿者：たかし（男性） 初めて行きます。20時ごろ伺う予定です。よろしくお願いします。',
    ].join(' ')

    const extracted = extractCustomerBbsText(text)

    assert.match(extracted, /たかし/)
    assert.match(extracted, /初めて行きます/)
    assert.doesNotMatch(extracted, /HoneyTrap/)
    assert.doesNotMatch(extracted, /ニップレス/)
    assert.doesNotMatch(extracted, /登録手数料無料/)
  })

  it('excludes store-authored Ogikubo announcements and relative-time-only legacy rows', () => {
    assert.equal(isStructurallyValidCustomerNormalizedPost({
      storeId: 'ogikubo-himitsu-club',
      authorName: '荻窪秘密俱楽部',
      body: '本日日曜日のイベントをご案内します。',
    }), false)
    assert.equal(isStructurallyValidCustomerNormalizedPost({
      storeId: 'ogikubo-himitsu-club',
      authorName: 'ヨンヨン',
      body: '1 2 1時間、 35分前',
    }), false)
    assert.equal(isStructurallyValidCustomerNormalizedPost({
      storeId: 'ogikubo-himitsu-club',
      authorName: 'ヨンヨン',
      body: '1時間後に伺います。',
    }), true)
    assert.equal(isStructurallyValidCustomerNormalizedPost({
      storeId: 'ogikubo-himitsu-club',
      authorName: 'SWIFT_yopn',
      body: '（♂） SWIFT перевод по ссылке [url=https://example.invalid/]подробнее[/url]',
    }), false)
    assert.equal(isStructurallyValidCustomerNormalizedPost({
      storeId: 'ogikubo-himitsu-club',
      authorName: 'visitor',
      body: 'Если вам нужна профессиональная поддержка, обратитесь к специалистам.',
    }), false)
  })

  it('searchable snapshot records only keep customer BBS text', () => {
    const searchableRecords = buildSearchableBbsRecords(
      [],
      [
        {
          id: 'noisy-snapshot',
          storeId: stores[0].id,
          url: 'https://example.com/bbs',
          extractedText:
            '当店からのお知らせ 女性無料イベント開催中です。 投稿者：しのみ 初めてですが、お昼過ぎに伺えたら。 投稿者：スタッフ 料金システムをご確認ください。',
          metrics: {
            femaleOnly: 0,
            firstVisit: 0,
            comeback: 0,
            groupVisit: 0,
            emoji: 0,
            totalSignals: 0,
            textLength: 0,
          },
          radarScore: 60,
          capturedAt: '2026-06-13T12:05:00.000Z',
        },
      ],
    )

    assert.equal(searchableRecords.length, 1)
    assert.match(searchableRecords[0].body, /しのみ/)
    assert.doesNotMatch(searchableRecords[0].body, /女性無料イベント/)
    assert.doesNotMatch(searchableRecords[0].body, /スタッフ/)
  })

  it('extracts normalized customer posts with article number, author, time, and body', () => {
    const normalizedPosts = extractNormalizedBbsPostsFromText(
      [
        '投稿者：HoneyTrap 【昼の部】 13時〜19時 女性無料イベント開催中です。',
        'No.59150 投稿日時：2026/07/02 04:15 投稿者：acco（女性） 朝活、予定次第ですが伺いたいです。',
        '記事番号：59151 投稿者：Kei（男性） 朝から伺おうかと思います！',
      ].join(' '),
      '2026-07-02T04:20:00.000Z',
    )

    assert.equal(normalizedPosts.length, 2)
    assert.equal(normalizedPosts[0].articleNo, '59150')
    assert.equal(normalizedPosts[0].authorName, 'acco')
    assert.equal(normalizedPosts[0].authorGender, '女性')
    assert.equal(normalizedPosts[0].postedAt, '2026-07-01T19:15:00.000Z')
    assert.match(normalizedPosts[0].body, /伺いたい/)
    assert.equal(normalizedPosts[1].articleNo, '59151')
    assert.equal(normalizedPosts[1].authorName, 'Kei')
  })

  it('separates inline gender and message text from the author field', () => {
    const [post] = extractNormalizedBbsPostsFromText(
      [
        '[[NR_POST]]',
        '投稿者： たま (女性) 夜ちょこっと行きます 投稿日：',
        'Re: 本日の営業スレッド',
        '投稿日： 2026/07/10(Fri) 16:31:20',
        '記事番号： 59712',
        '[[/NR_POST]]',
      ].join('\n'),
      '2026-07-10T07:35:00.000Z',
    )

    assert.equal(post.authorName, 'たま')
    assert.equal(post.authorGender, '女性')
    assert.equal(post.body, '夜ちょこっと行きます')
    assert.equal(post.postedAt, '2026-07-10T07:31:00.000Z')
  })

  it('repairs legacy contributor rows without a gender marker', () => {
    const [post] = extractNormalizedBbsPostsFromText(
      [
        '[[NR_POST]]',
        '投稿者： たんたん🍥 今から行きます！ 投稿日：',
        '明日12日',
        '投稿日： 2026/07/11(Sat) 23:33:09',
        '記事番号： 2445',
        '[[/NR_POST]]',
      ].join('\n'),
      '2026-07-12T03:00:00.000Z',
    )

    assert.equal(post.authorName, 'たんたん🍥')
    assert.equal(post.authorGender, '記載なし')
    assert.equal(post.body, '今から行きます！')
    assert.equal(post.articleNo, '2445')
  })

  it('does not accept a future visit date as the original posting time', () => {
    const [post] = extractNormalizedBbsPostsFromText(
      [
        '[[NR_POST]]',
        '投稿者： せんせい',
        '17日の夜に伺う予定です。',
        '投稿日： 2026/07/17 00:00',
        '[[/NR_POST]]',
      ].join('\n'),
      '2026-07-10T07:35:00.000Z',
    )

    assert.equal(post.postedAt, undefined)
  })

  it('uses normalized BBS posts instead of full scrape records when available', () => {
    const normalizedPosts: BbsNormalizedPost[] = [
      {
        id: 'np-1',
        sourceId: 'source-1',
        storeId: stores[0].id,
        sourceUrl: 'https://example.com/bbs',
        articleNo: '59150',
        authorName: 'acco',
        authorGender: '女性',
        postedAt: '2026-07-02T04:15:00.000Z',
        observedAt: '2026-07-02T04:20:00.000Z',
        body: '朝活、予定次第ですが伺いたいです。',
        bodyHash: 'hash',
        contentKey: 'article:59150',
      },
    ]
    const effective = buildEffectiveBbsPostRecords(
      [
        {
          id: 'scrape-full',
          storeId: stores[0].id,
          source: 'scrape',
          postedAt: '2026-07-02T04:20:00.000Z',
          body: '掲示板全体の長い本文 投稿者：acco（女性） 朝活、予定次第ですが伺いたいです。 投稿者：店長 イベント告知',
          keywords: [],
        },
      ],
      normalizedPosts,
    )

    assert.equal(effective.length, 1)
    assert.equal(effective[0].id, 'normalized-np-1')
    assert.match(effective[0].body, /投稿者: acco（女性）/)
    assert.doesNotMatch(effective[0].body, /店長/)
  })

  it('excludes time-unknown and store-authored rows from effective ranking posts', () => {
    const rows: BbsNormalizedPost[] = [
      {
        id: 'customer',
        storeId: 'b-dash',
        authorName: '来店者',
        authorGender: '男性',
        postedAt: '2026-07-10T04:15:00.000Z',
        observedAt: '2026-07-10T04:20:00.000Z',
        body: 'これから伺います。',
        bodyHash: 'customer',
        contentKey: 'customer',
      },
      {
        id: 'store',
        storeId: 'b-dash',
        authorName: 'B-DASH',
        authorGender: '記載なし',
        postedAt: '2026-07-10T04:16:00.000Z',
        observedAt: '2026-07-10T04:20:00.000Z',
        body: '本日の昼の部のお知らせです。',
        bodyHash: 'store',
        contentKey: 'store',
      },
      {
        id: 'time-unknown',
        storeId: 'b-dash',
        authorName: '時刻不明',
        authorGender: '女性',
        observedAt: '2026-07-10T04:20:00.000Z',
        body: '過去の投稿かもしれません。',
        bodyHash: 'time-unknown',
        contentKey: 'time-unknown',
      },
    ]

    const effective = buildEffectiveBbsPostRecords([], rows)

    assert.deepEqual(effective.map((post) => post.id), ['normalized-customer'])
  })

  it('does not count the same normalized row twice when paged results overlap', () => {
    const post: BbsNormalizedPost = {
      id: 'np-overlap',
      sourceId: 'source-1',
      storeId: stores[0].id,
      sourceUrl: 'https://example.com/bbs',
      articleNo: '60001',
      authorName: 'テスト投稿者',
      authorGender: '女性',
      postedAt: '2026-07-02T04:15:00.000Z',
      observedAt: '2026-07-02T04:20:00.000Z',
      body: '本日伺います。',
      bodyHash: 'hash-overlap',
      contentKey: 'article:60001',
    }

    const effective = buildEffectiveBbsPostRecords([], [post, post])

    assert.equal(effective.length, 1)
    assert.equal(effective[0].id, 'normalized-np-overlap')
  })

  it('deduplicates the same post when parser metadata changes between crawls', () => {
    const base: BbsNormalizedPost = {
      id: 'semantic-old',
      sourceId: 'source-1',
      storeId: 'filt-shibuya',
      authorName: 'とみぃ（指定なし）',
      authorGender: '記載なし',
      postedAt: '2026-07-10T12:58:00.000Z',
      observedAt: '2026-07-11T10:00:00.000Z',
      body: 'こんばんは〜見学しに行きます',
      bodyHash: 'old-hash',
      contentKey: 'old-key',
    }
    const reparsed: BbsNormalizedPost = {
      ...base,
      id: 'semantic-new',
      authorGender: '指定なし',
      observedAt: '2026-07-11T10:25:00.000Z',
      body: '[[NR_TARGET_DATE:2026-07-11]] こんばんは〜見学しに行きます',
      bodyHash: 'new-hash',
      contentKey: 'new-key',
    }

    const effective = buildEffectiveBbsPostRecords([], [reparsed, base])

    assert.equal(effective.length, 1)
    assert.equal(effective[0].id, 'normalized-semantic-new')
  })

  it('deduplicates a no-article post when a later parser pass adds a short body fragment', () => {
    const oldPost: BbsNormalizedPost = {
      id: 'filt-old-body',
      sourceId: 'source-filt',
      storeId: 'filt-shibuya',
      authorName: '同じ投稿者',
      authorGender: '女性',
      postedAt: '2026-07-12T04:15:00.000Z',
      observedAt: '2026-07-12T04:20:00.000Z',
      body: '昨日行けなかったので、今日行きます',
      bodyHash: 'old-body-hash',
      contentKey: 'old-body-key',
    }
    const reparsedPost: BbsNormalizedPost = {
      ...oldPost,
      id: 'filt-new-body',
      observedAt: '2026-07-12T04:30:00.000Z',
      body: '昨日行けなかったので、今日昼行きます',
      bodyHash: 'new-body-hash',
      contentKey: 'new-body-key',
    }

    const effective = buildEffectiveBbsPostRecords([], [oldPost, reparsedPost])

    assert.equal(effective.length, 1)
    assert.equal(effective[0].id, 'normalized-filt-new-body')
  })

  it('keeps distinct article-numbered posts even when their author, time, and body are similar', () => {
    const first: BbsNormalizedPost = {
      id: 'article-first',
      sourceId: 'source-articles',
      storeId: 'bar-canelo',
      articleNo: '70001',
      authorName: '同じ投稿者',
      authorGender: '女性',
      postedAt: '2026-07-12T04:15:00.000Z',
      observedAt: '2026-07-12T04:20:00.000Z',
      body: '今日行きます',
      bodyHash: 'article-first-hash',
      contentKey: 'article:70001',
    }
    const second: BbsNormalizedPost = {
      ...first,
      id: 'article-second',
      articleNo: '70002',
      observedAt: '2026-07-12T04:30:00.000Z',
      bodyHash: 'article-second-hash',
      contentKey: 'article:70002',
    }

    const effective = buildEffectiveBbsPostRecords([], [first, second])

    assert.equal(effective.length, 2)
  })

  it('detects watched female-focused signals', () => {
    const metrics = buildBbsSnapshotMetrics('女性 はじめて 2人組 😊 久しぶり')

    assert.equal(metrics.femaleOnly, 1)
    assert.equal(metrics.firstVisit, 1)
    assert.equal(metrics.groupVisit, 1)
    assert.ok(metrics.emoji >= 1)
    assert.ok(scoreBbsSnapshot(metrics) > 40)
  })

  it('finds saved watched words with full-width and whitespace normalization', () => {
    const hits = buildWatchedWordHits(
      [
        {
          id: 'bookmark-normalized-post',
          storeId: stores[0].id,
          source: 'scrape',
          postedAt: '2026-06-13T12:00:00.000Z',
          body: '投稿者：人気 単女 B さん 今日のBBSでは、来店予告がありました。',
          keywords: [],
        },
      ],
      stores,
      [
        {
          id: 'bookmark-normalized',
          label: '人気単女B',
          pattern: '人気単女Ｂ',
          matchType: 'exact',
          createdAt: '2026-06-13T12:00:00.000Z',
        },
      ],
    )

    assert.equal(hits.length, 1)
    assert.equal(hits[0].label, '人気単女B')
    assert.match(hits[0].snippet, /人気 単女 B/)
  })

  it('extracts watched word targets only from author names', () => {
    const target = extractWatchedAuthorText(
      [
        '投稿者：acco（女性） 朝活、予定次第ですが伺いたいです',
        'No.1644806)削除 明日7/2初めて伺いたいです！ レレイ さん (9wbul98n)',
      ].join('\n'),
    )

    assert.match(target, /acco 女性/)
    assert.match(target, /レレイ さん/)
    assert.doesNotMatch(target, /初めて伺いたい/)
  })

  it('extracts embedded author names without swallowing preceding body text', () => {
    const entries = extractWatchedAuthorEntries('タキ（男性）カス（カップル）ランチしてから遊びに行こうかなすん（女性）はるさんも来ます')

    assert.deepEqual(
      entries.map((entry) => entry.name),
      ['タキ', 'カス', 'すん'],
    )
    assert.equal(entries.some((entry) => normalizeWatchedSearchText(entry.authorText).includes('なす')), false)
  })

  it('does not use post body text for watched word hits', () => {
    const hits = buildWatchedWordHits(
      [
        {
          id: 'body-only-watched-post',
          storeId: stores[0].id,
          source: 'scrape',
          postedAt: '2026-06-13T12:00:00.000Z',
          body: '投稿者：レレイさん 明日7/2初めて伺いたいです。',
          keywords: [],
        },
      ],
      stores,
      [],
      { enabledTemplateKeys: ['first'] },
    )

    assert.equal(hits.length, 0)
  })

  it('groups repeated watched word hits within the same post', () => {
    const hits = buildWatchedWordHits(
      [
        {
          id: 'repeated-watched-post',
          storeId: stores[0].id,
          source: 'scrape',
          postedAt: '2026-06-13T12:00:00.000Z',
          body: '投稿者：初めてです(^_^) 初めてなのでよろしくお願いします。(^_^)',
          keywords: [],
        },
      ],
      stores,
      [],
      { enabledTemplateKeys: ['first', 'emoji'] },
    )

    assert.equal(hits.length, 2)
    assert.deepEqual(
      hits.map((hit) => hit.label).sort(),
      ['初めて', '絵文字/顔文字'],
    )
  })

  it('can disable default watched word templates', () => {
    const hits = buildWatchedWordHits(
      [
        {
          id: 'template-disabled-post',
          storeId: stores[0].id,
          source: 'scrape',
          postedAt: '2026-06-13T12:00:00.000Z',
          body: '投稿者：女性 初めて 2人組 😊 久しぶり',
          keywords: [],
        },
      ],
      stores,
      [],
      { enabledTemplateKeys: ['female'] },
    )

    assert.equal(hits.length, 1)
    assert.equal(hits[0].label, '女性のみ')
  })

  it('filters watched word hits by store', () => {
    const scopedPosts: PostRecord[] = [
      {
        id: 'store-filter-a',
        storeId: stores[0].id,
        source: 'scrape',
        postedAt: '2026-06-13T12:00:00.000Z',
        body: '投稿者：初めてさん 来店します。',
        keywords: [],
      },
      {
        id: 'store-filter-b',
        storeId: stores[1].id,
        source: 'scrape',
        postedAt: '2026-06-13T12:05:00.000Z',
        body: '投稿者：初めてさん 来店します。',
        keywords: [],
      },
    ]

    const hits = buildWatchedWordHits(scopedPosts, stores, [], {
      enabledTemplateKeys: ['first'],
      storeId: stores[1].id,
    })

    assert.equal(hits.length, 1)
    assert.equal(hits[0].store.id, stores[1].id)
  })

  it('normalizes large BBS pages without hard-clamping every store to 100', () => {
    const noisyLargePage: BbsSnapshotMetrics = {
      femaleOnly: 83,
      firstVisit: 3,
      comeback: 3,
      groupVisit: 1,
      emoji: 331,
      totalSignals: 421,
      textLength: 12000,
    }
    const focusedMediumPage: BbsSnapshotMetrics = {
      femaleOnly: 11,
      firstVisit: 14,
      comeback: 0,
      groupVisit: 0,
      emoji: 26,
      totalSignals: 51,
      textLength: 4326,
    }

    const noisyScore = scoreBbsSnapshot(noisyLargePage)
    const focusedScore = scoreBbsSnapshot(focusedMediumPage)

    assert.ok(noisyScore < 100)
    assert.ok(focusedScore < 100)
    assert.ok(noisyScore > focusedScore)
  })

  it('keeps visible score differences across stores with BBS snapshots', () => {
    const metricsList: BbsSnapshotMetrics[] = [
      {
        femaleOnly: 83,
        firstVisit: 3,
        comeback: 3,
        groupVisit: 1,
        emoji: 331,
        totalSignals: 421,
        textLength: 12000,
      },
      {
        femaleOnly: 11,
        firstVisit: 14,
        comeback: 0,
        groupVisit: 0,
        emoji: 26,
        totalSignals: 51,
        textLength: 4326,
      },
      {
        femaleOnly: 2,
        firstVisit: 0,
        comeback: 0,
        groupVisit: 0,
        emoji: 4,
        totalSignals: 6,
        textLength: 1800,
      },
    ]
    const snapshots: BbsSnapshot[] = stores.slice(0, 3).map((store, index) => ({
      id: `snapshot-${store.id}`,
      sourceId: `${store.id}-bbs`,
      storeId: store.id,
      url: 'https://example.com/bbs',
      extractedText: '',
      metrics: metricsList[index],
      radarScore: scoreBbsSnapshot(metricsList[index]),
      capturedAt: `2026-06-13T0${index}:00:00.000Z`,
    }))

    const radar = buildStoreRadarPoints(stores.slice(0, 3), [], snapshots)
    const scores = radar.map((point) => point.score)

    assert.equal(radar[0].rank, 1)
    assert.equal(scores.every((score) => score < 100), true)
    assert.ok(new Set(scores).size > 1)
    assert.ok(scores[0] > scores.at(-1)!)
  })

  it('builds store radar points and visit forecasts', () => {
    const radar = buildStoreRadarPoints(stores, posts)
    const watchedPosts: PostRecord[] = [
      ...posts,
      {
        id: 'forecast-author-watched-post',
        storeId: stores[0].id,
        source: 'scrape',
        postedAt: '2026-06-13T12:00:00.000Z',
        body: '投稿者：初めてさん（女性） 本日伺います。',
        keywords: [],
      },
    ]
    const hits = buildWatchedWordHits(watchedPosts, stores)
    const forecasts = buildVisitForecasts(events, stores, watchedPosts)

    assert.equal(radar[0].rank, 1)
    assert.ok(radar[0].score >= 0)
    assert.ok(hits.length > 0)
    assert.equal(forecasts[0].rank, 1)
  })
})
