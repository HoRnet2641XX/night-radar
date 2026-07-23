import assert from 'node:assert/strict'
import test from 'node:test'
import { cronCrawlHttpStatus } from './cron-auth'

test('cron crawl distinguishes a partial source failure from a failed job', () => {
  assert.equal(cronCrawlHttpStatus(0, 0), 200)
  assert.equal(cronCrawlHttpStatus(0, 25), 200)
  assert.equal(cronCrawlHttpStatus(1, 25), 200)
  assert.equal(cronCrawlHttpStatus(25, 25), 502)
})
