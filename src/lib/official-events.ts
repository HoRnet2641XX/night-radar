import officialEventsData from './official-events.generated.json'
import type { EventInput } from './types'

const officialEvents = officialEventsData as EventInput[]

export function mergeOfficialEvents(events: EventInput[]) {
  const merged = new Map(officialEvents.map((event) => [event.id, event]))
  for (const event of events) {
    const official = merged.get(event.id)
    merged.set(event.id, {
      ...official,
      ...event,
      details: event.details || official?.details,
      sourceUrl: event.sourceUrl || official?.sourceUrl,
    })
  }
  return [...merged.values()].filter((event) => /^\d{4}-\d{2}-\d{2}$/.test(event.date))
}
