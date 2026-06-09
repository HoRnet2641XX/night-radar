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

  it('accepts Japanese headers and fills missing ids', () => {
    const result = parseCsvText('店舗名,エリア,昼営業,夜営業\nテスト店,新宿,true,true\n', 'stores')
    const store = result.items[0] as StoreProfile

    assert.deepEqual(result.errors, [])
    assert.equal(store.name, 'テスト店')
    assert.equal(store.area, '新宿')
    assert.match(store.id, /^stores-1-/)
  })
})
