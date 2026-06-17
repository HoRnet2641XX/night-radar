export function formatBarName(name?: string | null) {
  const raw = name?.trim()
  if (!raw) return '未登録店舗'

  const normalized = raw
    .replace(/^communication\s*bar\s*/i, '')
    .replace(/^bar[\s_-]*/i, '')
    .replace(/[\s_-]*bar$/i, '')
    .trim()

  return `bar ${normalized || raw}`
}

export function formatStoreArea(area?: string | null) {
  const value = area?.trim()
  if (!value || value === '未設定') return 'エリア未登録'
  return value
}

export function formatStoreSessionLabel(store: { hasDaytime?: boolean; hasNight?: boolean }) {
  if (store.hasDaytime && store.hasNight) return '昼・夜営業'
  if (store.hasDaytime) return '昼営業'
  if (store.hasNight) return '夜営業'
  return '営業時間未登録'
}
