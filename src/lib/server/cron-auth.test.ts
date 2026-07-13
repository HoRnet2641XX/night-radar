import assert from 'node:assert/strict'
import test from 'node:test'
import { cronCrawlHttpStatus } from './cron-auth'

test('cron crawl returns 502 when a blocked, failed, or parser-drop run is counted', () => {
  assert.equal(cronCrawlHttpStatus(0), 200)
  assert.equal(cronCrawlHttpStatus(1), 502)
  assert.equal(cronCrawlHttpStatus(3), 502)
})
