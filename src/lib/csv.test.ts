import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { csvTemplates, parseCsvText } from './csv'
import type { StoreProfile } from './types'

describe('parseCsvText', () => {
  it('parses store CSV into typed list fields', () => {
    const result = parseCsvText(csvTemplates.stores, 'stores')
    const store = result.items[0] as StoreProfile

    assert.deepEqual(result.errors, [])
    assert.deepEqual(
      {
        id: store.id,
        name: store.name,
        strongDays: store.strongDays,
      },
      {
        id: 'sample-store',
        name: 'サンプル店',
        strongDays: ['火曜', '金曜'],
      },
    )
  })

  it('returns row errors for invalid post CSV', () => {
    const result = parseCsvText('id,storeId,body\npost-1,,', 'posts')

    assert.deepEqual(result.items, [])
    assert.ok(result.errors.length > 0)
  })
})
