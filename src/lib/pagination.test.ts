import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { collectPagedRows } from './pagination'

describe('collectPagedRows', () => {
  it('loads every page instead of stopping at the Supabase row limit', async () => {
    const source = Array.from({ length: 2312 }, (_, index) => ({ id: index + 1 }))
    const ranges: Array<[number, number]> = []

    const result = await collectPagedRows(async (from, to) => {
      ranges.push([from, to])
      return { data: source.slice(from, to + 1), error: null }
    })

    assert.equal(result.error, null)
    assert.equal(result.data?.length, 2312)
    assert.deepEqual(ranges, [
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ])
  })
})
