import type { StoreProfile } from './types'

const verifiedStoreAreas: Record<string, string> = {
  agreeable: '新宿',
  arabesque: '新宿',
  'b-dash': '池袋',
  'bar-canelo': '五反田',
  'bar-face': '六本木・西麻布',
  'bar-rusk': '上野・御徒町',
  'bar-spear': '五反田',
  bar440: '新宿・歌舞伎町',
  'campo-bar': '錦糸町',
  'club-scarlet-tokyo': '新宿',
  collabo: '秋葉原',
  'colors-bar': '新宿',
  'filt-shibuya': '渋谷',
  'harnes-tokyo': '上野',
  'honey-trap': '上野',
  'land-land': '聖蹟桜ヶ丘',
  'ogikubo-himitsu-club': '荻窪',
  papillon: '上野',
  'retreat-bar': '新宿',
  'secret-bar-silent-moon': '渋谷',
  voluptuous: '新宿',
}

const genericAreas = new Set(['', '未設定', '都内', '東京'])

export function resolvedStoreArea(storeId: string, currentArea?: string | null) {
  const current = currentArea?.trim() ?? ''
  if (!genericAreas.has(current)) return current
  return verifiedStoreAreas[storeId] ?? 'エリア未確認'
}

export function resolvedStoreOfficialUrl(store: Pick<StoreProfile, 'officialUrl'>, sourceUrl?: string) {
  const officialUrl = store.officialUrl?.trim()
  if (officialUrl) return officialUrl
  if (!sourceUrl) return undefined

  try {
    const parsed = new URL(sourceUrl)
    return `${parsed.protocol}//${parsed.host}/`
  } catch {
    return undefined
  }
}

export function resolvedStoreMapUrl(
  store: Pick<StoreProfile, 'id' | 'name' | 'area' | 'address' | 'mapUrl'>,
) {
  const mapUrl = store.mapUrl?.trim()
  if (mapUrl) return mapUrl
  const area = resolvedStoreArea(store.id, store.area)
  const query = [store.address?.trim(), store.name, area === 'エリア未確認' ? '' : area].filter(Boolean).join(' ')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}
