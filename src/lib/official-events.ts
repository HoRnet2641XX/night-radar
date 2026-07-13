import officialEventsData from './official-events.generated.json'
import type { EventInput } from './types'

const officialEvents = officialEventsData as EventInput[]

export function mergeOfficialEvents(events: EventInput[]) {
  const source = events.length ? events : officialEvents
  return [...new Map(source.map((event) => [event.id, event])).values()].filter((event) => /^\d{4}-\d{2}-\d{2}$/.test(event.date))
}
