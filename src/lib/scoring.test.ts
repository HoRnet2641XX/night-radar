import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { BbsSnapshot, BbsSnapshotMetrics, EventInput } from './types'
import { events, posts, stores } from './demo-data'
import { formatEventDateLabel, weekdayLabelForJapanDate } from './date'
import {
  buildBbsSnapshotMetrics,
  buildSearchableBbsRecords,
  buildStoreBbsAnalytics,
  buildStoreRadarPoints,
  buildVisitForecasts,
  buildWatchedWordHits,
  parseExactTerms,
  scoreBbsSnapshot,
  scoreEvents,
  searchExactBbsTerms,
} from './scoring'

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
    const matches = searchExactBbsTerms(posts, stores, [
      {
        group: 'popularSingleMale',
        label: '人気単独男性',
        terms: parseExactTerms('人気単男A\n存在しない語'),
      },
    ])

    assert.ok(matches.length > 0)
    assert.equal(matches.every((match) => match.term === '人気単男A'), true)
  })

  it('normalizes full-width characters and whitespace for exact term matching', () => {
    const matches = searchExactBbsTerms(
      [
        {
          id: 'normalized-post',
          storeId: stores[0].id,
          source: 'manual',
          postedAt: '2026-06-13T12:00:00.000Z',
          body: '人気 単男 A が反応しました。',
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
    const longBody = `${'通常テキスト'.repeat(180)} 人気単女Z が来店予告しました。`
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
})

describe('BBS radar signals', () => {
  it('detects watched female-focused signals', () => {
    const metrics = buildBbsSnapshotMetrics('女性 はじめて 2人組 😊 久しぶり')

    assert.equal(metrics.femaleOnly, 1)
    assert.equal(metrics.firstVisit, 1)
    assert.equal(metrics.groupVisit, 1)
    assert.ok(metrics.emoji >= 1)
    assert.ok(scoreBbsSnapshot(metrics) > 40)
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
    const hits = buildWatchedWordHits(posts, stores)
    const forecasts = buildVisitForecasts(events, stores, posts)

    assert.equal(radar[0].rank, 1)
    assert.ok(radar[0].score >= 0)
    assert.ok(hits.length > 0)
    assert.equal(forecasts[0].rank, 1)
  })
})
