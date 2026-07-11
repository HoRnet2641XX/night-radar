import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { storageSafeText } from './text'

describe('storageSafeText', () => {
  it('does not split an emoji surrogate pair at the storage limit', () => {
    const value = `${'a'.repeat(1499)}🤠after`
    const result = storageSafeText(value, 1500)

    assert.equal(result, 'a'.repeat(1499))
    assert.equal(JSON.parse(JSON.stringify(result)), result)
  })

  it('keeps complete emoji and replaces malformed input surrogates', () => {
    assert.equal(storageSafeText('before🤠after', 8), 'before🤠')
    assert.equal(storageSafeText('before\ud83dafter'), 'before\ufffdafter')
  })
})
