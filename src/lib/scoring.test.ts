import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { BbsSnapshot, BbsSnapshotMetrics } from './types'
import { events, posts, stores } from './demo-data'
import {
  buildBbsSnapshotMetrics,
  buildStoreBbsAnalytics,
  buildStoreRadarPoints,
  buildVisitForecasts,
  buildWatchedWordHits,
  parseExactTerms,
  scoreBbsSnapshot,
  scoreEvents,
  searchExactBbsTerms,
} from './scoring'

describe('scoreEvents', () => {
  it('ranks events and attaches store metrics', () => {
    const scored = scoreEvents(events, stores, posts)

    assert.equal(scored.length, events.length)
    assert.equal(scored[0].rank, 1)
    assert.ok(scored[0].score >= (scored.at(-1)?.score ?? 0))
    assert.ok(scored[0].store.name)
    assert.ok(scored[0].metrics.postCount > 0)
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
        label: '人気単男',
        terms: parseExactTerms('人気単男A\n存在しない語'),
      },
    ])

    assert.ok(matches.length > 0)
    assert.equal(matches.every((match) => match.term === '人気単男A'), true)
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
