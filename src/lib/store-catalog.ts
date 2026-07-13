import type { StoreProfile } from './types'

type VerifiedStoreMetadata = Partial<
  Pick<StoreProfile, 'area' | 'address' | 'nearestStation' | 'phone' | 'officialUrl' | 'priceNote'>
>

// Values below were checked against each store's official access/system page on 2026-07-12.
// Exact addresses are intentionally omitted when the store publishes only a meeting point.
const verifiedStoreMetadata: Record<string, VerifiedStoreMetadata> = {
  agreeable: {
    area: '新宿',
    nearestStation: '新宿東宝ビル正面から電話案内',
    phone: '03-6875-5696',
    officialUrl: 'https://agreeable.bar/',
    priceNote: '入場料 男性3,000円〜 / 女性0円〜（入会金別）',
  },
  arabesque: {
    area: '新宿',
    nearestStation: '新宿三丁目駅 C4出口から電話案内',
    phone: '03-5925-8747',
    officialUrl: 'https://arabesque.jpn.com/',
    priceNote: 'チャージ 男性5,000円〜 / 女性1,000円〜（入会金別）',
  },
  'b-dash': {
    area: '池袋',
    nearestStation: '池袋駅西口から徒歩5分・指定地点から電話案内',
    phone: '03-6384-4057',
    officialUrl: 'https://b-dash.bar/',
    priceNote: '入場料 男性8,000円〜 / 女性無料（入会金別）',
  },
  'bar-canelo': {
    area: '五反田',
    nearestStation: 'JR・東急池上線 五反田駅から徒歩2分',
    phone: '03-6874-8241',
    officialUrl: 'https://barcanelo.com/',
    priceNote: '入場料 男性8,000円〜 / 女性0円（入会金別）',
  },
  'bar-face': {
    area: '六本木・西麻布',
    nearestStation: '六本木駅2番出口から徒歩3分',
    phone: '03-6884-8058',
    officialUrl: 'https://bar-face.jp/',
    priceNote: '入場料 男性8,000円〜 / 女性0円（入会金別）',
  },
  'bar-rusk': {
    area: '上野・御徒町',
    address: '東京都台東区上野2丁目',
    nearestStation: '京成上野駅C5出口から徒歩2分',
    phone: '03-5817-8857',
    officialUrl: 'https://bar-rusk.com/',
    priceNote: '入場料 男性8,000円〜 / 女性0円（入会金別）',
  },
  'bar-spear': {
    area: '五反田',
    address: '東京都品川区東五反田1-23-6 ロゼビル4F',
    nearestStation: 'JR五反田駅東口から徒歩5分',
    phone: '03-6721-7941',
    officialUrl: 'https://www.barspear.com/',
    priceNote: '入場料 男性10,000円〜 / 女性0円（入会金別）',
  },
  bar440: {
    area: '新宿・歌舞伎町',
    address: '東京都新宿区歌舞伎町',
    nearestStation: 'JR新宿駅から徒歩7分・指定地点から電話案内',
    phone: '050-1504-8152',
    officialUrl: 'https://bar440.jimdofree.com/',
    priceNote: '入場料 男性8,000円〜 / 女性1,000円（入会金別）',
  },
  'campo-bar': {
    area: '錦糸町',
    address: '東京都墨田区江東橋4-28-3 ビフールドビル3F',
    nearestStation: '錦糸町駅南口から徒歩2分',
    phone: '03-4361-5641',
    officialUrl: 'https://campo-bar.com/',
    priceNote: '入場料 男性8,000円〜 / 女性0円（入会金別）',
  },
  'club-scarlet-tokyo': {
    area: '新宿',
    address: '東京都新宿区歌舞伎町1-10-1 遊悠館B1F',
    nearestStation: '新宿・歌舞伎町',
    phone: '03-6233-9050',
    officialUrl: 'https://scarlet.tokyo/',
    priceNote: '入場料 男性9,000円〜 / 女性0円（入会金別）',
  },
  'club-zeus': {
    area: '蒲田',
    nearestStation: 'JR蒲田駅東口から徒歩1分・電話案内',
    phone: '03-6424-7507',
    officialUrl: 'http://sm-zeus.com/',
    priceNote: '入場料 男性7,000円〜 / 女性500円〜（入会金別）',
  },
  collabo: {
    area: '秋葉原',
    nearestStation: 'JR秋葉原駅から徒歩4分・完全予約制',
    officialUrl: 'https://www.collabo7.com/',
    priceNote: '参加費 男性10,000円 / 女性無料 / カップル5,000円（入会金別）',
  },
  'colors-bar': {
    area: '新宿',
    nearestStation: '新宿',
    phone: '03-5273-1780',
    officialUrl: 'https://t-colors.net/',
    priceNote: '入場料 男性7,000円〜 / 女性無料（入会金別）',
  },
  'communicationbar-sango': {
    area: '八王子',
    nearestStation: 'JR八王子駅北口から徒歩5分・電話案内',
    phone: '042-690-1887',
    officialUrl: 'https://bar-sango.com/',
    priceNote: '入場料 男性7,000円〜 / 女性0円（入会金別）',
  },
  'filt-shibuya': {
    area: '渋谷',
    address: '東京都渋谷区道玄坂2-21-1',
    nearestStation: '渋谷駅',
    officialUrl: 'https://filtshibuya.com/',
    priceNote: '入場料 男性8,000円〜 / 女性0円（入会金別）',
  },
  'harnes-tokyo': {
    area: '上野',
    nearestStation: 'JR上野駅広小路口から徒歩3分・電話案内',
    phone: '03-5816-1199',
    officialUrl: 'https://harnes.tokyo/',
    priceNote: '入場料 男性9,000円〜 / 女性無料（入会金別）',
  },
  'honey-trap': {
    area: '上野',
    address: '東京都台東区上野5-25-17 東成ビルB1F',
    nearestStation: '御徒町駅',
    phone: '03-5826-8799',
    officialUrl: 'https://bar-honeytrap.com/',
    priceNote: '入場料 男性8,000円〜 / 女性0円（入会金別）',
  },
  'land-land': {
    area: '聖蹟桜ヶ丘',
    address: '東京都多摩市関戸2-24-26 加瀬ビル4F',
    nearestStation: '京王線 聖蹟桜ヶ丘駅から徒歩3分',
    phone: '042-400-6689',
    officialUrl: 'https://land2021.com/',
    priceNote: '入店料金 男性6,000円〜 / 女性1,000円（入会金別）',
  },
  'mille-feuille': {
    area: '渋谷',
    address: '東京都渋谷区道玄坂1-15-7 セントラル道玄坂4F',
    nearestStation: '渋谷駅・道玄坂上',
    phone: '03-4335-8080',
    officialUrl: 'https://www.millefeuillesby.com/',
    priceNote: '入場料 男性10,000円〜 / 女性2,000円（BBS割引あり・入会金別）',
  },
  neo: {
    area: '錦糸町',
    address: '東京都墨田区江東橋4-20-1 平山ビル3F',
    nearestStation: '錦糸町駅南口から徒歩5分',
    phone: '070-3274-3828',
    officialUrl: 'https://neo-nk.com/',
    priceNote: '入場料 男性8,000円〜 / 女性1,000円（入会金別）',
  },
  'ogikubo-himitsu-club': {
    area: '荻窪',
    address: '東京都杉並区上荻1-16-6',
    nearestStation: 'JR荻窪駅から徒歩2分・電話案内',
    phone: '03-6821-1299',
    officialUrl: 'https://ogikubo0620.com/',
    priceNote: 'チャージ 男性7,000円〜 / 女性0円（入会金別）',
  },
  papillon: {
    area: '上野',
    nearestStation: '上野駅不忍口・指定地点から電話案内',
    phone: '03-6284-4680',
    officialUrl: 'https://bar-papillon.net/',
    priceNote: '入場料 男性7,000円〜 / 女性0円（入会金別）',
  },
  'retreat-bar': {
    area: '新宿',
    nearestStation: 'JR新宿駅東口から徒歩8分',
    phone: '03-3202-5665',
    officialUrl: 'https://retreatbar.jp/',
    priceNote: '入場料 男性8,000円〜 / 女性0円（入会金別）',
  },
  'secret-bar-silent-moon': {
    area: '渋谷',
    address: '東京都渋谷区道玄坂1-13',
    nearestStation: '京王井の頭線 渋谷駅から徒歩2分・電話案内',
    phone: '03-3770-8300',
    officialUrl: 'https://www.silent-moon.net/',
    priceNote: 'チャージ 男性7,000円 / 女性500円（入会金別）',
  },
  voluptuous: {
    area: '新宿',
    nearestStation: '歌舞伎町入口・指定地点から電話案内',
    phone: '03-6380-3192',
    officialUrl: 'https://voluptuous.tokyo/',
    priceNote: '入場料 男性10,000円〜 / 女性0円（入会金別）',
  },
}

const genericAreas = new Set(['', '未設定', '都内', '東京'])

export function resolvedStoreArea(storeId: string, currentArea?: string | null) {
  const current = currentArea?.trim() ?? ''
  if (!genericAreas.has(current)) return current
  return verifiedStoreMetadata[storeId]?.area ?? 'エリア未確認'
}

export function resolvedStoreMetadata(store: StoreProfile): StoreProfile {
  const verified = verifiedStoreMetadata[store.id] ?? {}
  const merged: StoreProfile = {
    ...store,
    area: resolvedStoreArea(store.id, store.area),
    address: store.address?.trim() || verified.address,
    nearestStation: store.nearestStation?.trim() || verified.nearestStation,
    phone: store.phone?.trim() || verified.phone,
    officialUrl: store.officialUrl?.trim() || verified.officialUrl,
    priceNote: store.priceNote?.trim() || verified.priceNote,
  }
  return { ...merged, mapUrl: resolvedStoreMapUrl(merged) }
}

export function resolvedStoreOfficialUrl(
  store: Pick<StoreProfile, 'officialUrl'> & Partial<Pick<StoreProfile, 'id'>>,
  sourceUrl?: string,
) {
  const officialUrl = store.officialUrl?.trim() || (store.id ? verifiedStoreMetadata[store.id]?.officialUrl : undefined)
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
  const verified = verifiedStoreMetadata[store.id]
  const address = store.address?.trim() || verified?.address
  const area = resolvedStoreArea(store.id, store.area)
  const query = [address, store.name, area === 'エリア未確認' ? '' : area].filter(Boolean).join(' ')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}
