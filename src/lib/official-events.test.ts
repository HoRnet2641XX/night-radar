import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeOfficialEvents } from './official-events'
import type { EventInput } from './types'

test('database events remain authoritative and deleted generated events are not restored', () => {
  const databaseEvent: EventInput = {
    id: 'database-only-event',
    storeId: 'agreeable',
    date: '2026-07-13',
    weekday: '月曜',
    startsAt: '19:00',
    session: 'night',
    category: '公式イベント',
    title: 'DBで確認したイベント',
  }

  assert.deepEqual(mergeOfficialEvents([databaseEvent]), [databaseEvent])
  assert.ok(mergeOfficialEvents([]).length > 0)
})
