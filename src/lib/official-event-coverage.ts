import coverageData from './official-event-coverage.generated.json'
import type { EventInput } from './types'

export type OfficialEventCoverageStatus = 'scheduled' | 'none' | 'external' | 'unverified'

export type OfficialEventCoverage = {
  storeId: string
  storeName: string
  month: string
  status: OfficialEventCoverageStatus
  eventCount: number
  sourceUrls: string[]
  checkedAt: string
  note: string
}

const coverage = coverageData as OfficialEventCoverage[]

export function officialEventCoverageStatus(
  storeId: string,
  month: string,
  events: EventInput[] = [],
): OfficialEventCoverageStatus {
  const stored = coverage.find((entry) => entry.storeId === storeId && entry.month === month)
  if (stored) return stored.status
  return events.some((event) => event.storeId === storeId && event.date.startsWith(`${month}-`))
    ? 'scheduled'
    : 'unverified'
}

export function officialEventCoverageForMonth(month: string) {
  return coverage.filter((entry) => entry.month === month)
}
