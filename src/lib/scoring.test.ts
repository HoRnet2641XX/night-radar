import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { events, posts, stores } from './demo-data'
import { buildStoreBbsAnalytics, parseExactTerms, scoreEvents, searchExactBbsTerms } from './scoring'

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
