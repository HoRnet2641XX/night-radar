import type { EventInput } from './types'

export const weekdayLabels = ['月曜', '火曜', '水曜', '木曜', '金曜', '土曜', '日曜'] as const

const weekdayShortFormatter = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  weekday: 'short',
})
const japanDatePartsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const weekdayIndexFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Tokyo',
  weekday: 'short',
})

const weekdayIndexByShortLabel: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

function padDatePart(value: number) {
  return String(value).padStart(2, '0')
}

export function weekdayLabelForDate(date: Date) {
  const shortLabel = weekdayShortFormatter.format(date).replace('曜日', '').replace('曜', '')
  return `${shortLabel}曜`
}

export function weekdayIndexForDateInJapan(date: Date) {
  return weekdayIndexByShortLabel[weekdayIndexFormatter.format(date)] ?? 0
}

export function dateFromJapanParts(year: number, month: number, day: number) {
  return new Date(`${year}-${padDatePart(month)}-${padDatePart(day)}T00:00:00+09:00`)
}

export function weekdayLabelForJapanDate(year: number, month: number, day: number) {
  return weekdayLabelForDate(dateFromJapanParts(year, month, day))
}

export function weekdayIndexForJapanDate(year: number, month: number, day: number) {
  return weekdayIndexForDateInJapan(dateFromJapanParts(year, month, day))
}

export function daysInMonthInJapan(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function dateKeyInJapan(date = new Date()) {
  const parts = Object.fromEntries(
    japanDatePartsFormatter.formatToParts(date).map((part) => [part.type, part.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function monthKeyInJapan(date = new Date()) {
  return dateKeyInJapan(date).slice(0, 7)
}

export function todayInJapan(date = new Date()) {
  const key = dateKeyInJapan(date)
  return new Date(`${key}T00:00:00+09:00`)
}

export function relativeDateInJapan(offsetDays: number, referenceDate = new Date()) {
  return new Date(todayInJapan(referenceDate).getTime() + offsetDays * 24 * 60 * 60 * 1000)
}

export function parseDateInJapan(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00+09:00`)
    return Number.isNaN(date.getTime()) ? null : date
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function weekdayFromDate(value: string, fallback = '未設定') {
  const date = parseDateInJapan(value)
  return date ? weekdayLabelForDate(date) : fallback
}

export function eventWeekday(event: Pick<EventInput, 'date' | 'weekday'>) {
  const dateLabel = event.date.trim()
  const weekday = event.weekday.trim()

  if (/^\d{4}-\d{2}-\d{2}$/.test(dateLabel)) return weekdayFromDate(dateLabel, weekday || '未設定')
  if (dateLabel === '今日') return weekdayLabelForDate(relativeDateInJapan(0))
  if (dateLabel === '明日') return weekdayLabelForDate(relativeDateInJapan(1))
  if (weekdayLabels.includes(dateLabel as (typeof weekdayLabels)[number])) return dateLabel
  return weekday || '未設定'
}

export function formatEventDateLabel(event: Pick<EventInput, 'date' | 'weekday'>) {
  const dateLabel = event.date.trim()
  const weekday = eventWeekday(event)
  const shortWeekday = weekday.replace('曜', '')

  if (/^\d{4}-\d{2}-\d{2}$/.test(dateLabel)) {
    const [, month, day] = dateLabel.split('-').map(Number)
    return `${month}/${day}(${shortWeekday})`
  }

  if (dateLabel === '今日' || dateLabel === '明日') return `${dateLabel}(${shortWeekday})`
  return dateLabel
}
