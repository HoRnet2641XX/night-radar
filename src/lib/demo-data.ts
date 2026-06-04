import type { EventInput, PlanKey, PostRecord, StoreProfile, StoreSituation, WordCategory } from './types'

const demoBaseTime = Date.UTC(2026, 5, 2, 12, 0, 0)

function daysAgoIso(days: number, hour = 19) {
  const date = new Date(demoBaseTime - days * 24 * 60 * 60 * 1000)
  date.setUTCHours(hour, 0, 0, 0)
  return date.toISOString()
}

export const plans: Array<{
  key: PlanKey
  label: string
  price: string
  quota: string
  summary: string
  stripePriceEnv: string
}> = [
  {
    key: 'free',
    label: '無料',
    price: '0円',
    quota: '1日3通',
    summary: '昼TOP1、夜TOP1、嗜好ワード1通',
    stripePriceEnv: '',
  },
  {
    key: 'light',
    label: 'ライト',
    price: '500円',
    quota: '1日10通',
    summary: 'TOP3、フォロー3件、ワード3カテゴリ',
    stripePriceEnv: 'STRIPE_PRICE_LIGHT',
  },
  {
    key: 'standard',
    label: 'スタンダード',
    price: '980円',
    quota: '1日30通',
    summary: '店舗別トレンド、過去比較、期待度予測',
    stripePriceEnv: 'STRIPE_PRICE_STANDARD',
  },
  {
    key: 'premium',
    label: 'プレミアム',
    price: '1,980円',
    quota: '高優先通知',
    summary: '複数エリア、カスタムワード、先7日予測',
    stripePriceEnv: 'STRIPE_PRICE_PREMIUM',
  },
]

export const stores: StoreProfile[] = [
  {
    id: 'a-store',
    name: 'A店',
    area: '都内テストエリア',
    hasDaytime: true,
    hasNight: true,
    openingHourDay: '13:00',
    openingHourNight: '19:00',
    prStructure: '具体型',
    strongDays: ['火曜', '金曜'],
    strongEvents: ['昼主婦系', '初心者系'],
    weakEvents: ['SM系'],
    trustSeed: 78,
  },
  {
    id: 'b-store',
    name: 'B店',
    area: '都内テストエリア',
    hasDaytime: false,
    hasNight: true,
    openingHourDay: '',
    openingHourNight: '19:00',
    prStructure: 'イベント型',
    strongDays: ['金曜', '土曜'],
    strongEvents: ['カップル系', '女性無料系'],
    weakEvents: ['初心者系'],
    trustSeed: 74,
  },
  {
    id: 'c-store',
    name: 'C店',
    area: '都内テストエリア',
    hasDaytime: true,
    hasNight: false,
    openingHourDay: '13:00',
    openingHourNight: '',
    prStructure: '昼強め',
    strongDays: ['日曜'],
    strongEvents: ['昼主婦系', '平日穴場系'],
    weakEvents: ['女性無料系'],
    trustSeed: 69,
  },
  {
    id: 'd-store',
    name: 'D店',
    area: '都内テストエリア',
    hasDaytime: false,
    hasNight: true,
    openingHourDay: '',
    openingHourNight: '20:00',
    prStructure: '嗜好特化型',
    strongDays: ['水曜'],
    strongEvents: ['SM系', '初心者系'],
    weakEvents: ['昼主婦系'],
    trustSeed: 66,
  },
]

export const events: EventInput[] = [
  {
    id: 'ev-1',
    storeId: 'a-store',
    date: '今日',
    weekday: '火曜',
    startsAt: '13:00',
    session: 'day',
    category: '昼主婦系',
    title: '昼主婦系イベント',
  },
  {
    id: 'ev-2',
    storeId: 'b-store',
    date: '今日',
    weekday: '火曜',
    startsAt: '19:00',
    session: 'night',
    category: '女性無料系',
    title: '女性無料イベント',
  },
  {
    id: 'ev-3',
    storeId: 'c-store',
    date: '明日',
    weekday: '水曜',
    startsAt: '13:00',
    session: 'day',
    category: '初心者系',
    title: '初心者デー',
  },
  {
    id: 'ev-4',
    storeId: 'd-store',
    date: '明日',
    weekday: '水曜',
    startsAt: '19:00',
    session: 'night',
    category: 'SM系',
    title: '嗜好イベント',
  },
  {
    id: 'ev-5',
    storeId: 'a-store',
    date: '金曜',
    weekday: '金曜',
    startsAt: '19:00',
    session: 'night',
    category: '初心者系',
    title: '初心者イベント',
  },
]

export const posts: PostRecord[] = [
  {
    id: 'post-1',
    storeId: 'a-store',
    source: 'manual',
    postedAt: daysAgoIso(0, 12),
    body: '本日13時から昼イベント。昼、主婦、初参加ワードが強め。人気単女Bの書き込みあり。時間帯と人数感が具体的。',
    keywords: ['昼', '主婦', '初参加', '人気単女B'],
  },
  {
    id: 'post-2',
    storeId: 'b-store',
    source: 'manual',
    postedAt: daysAgoIso(1, 20),
    body: '19時前後に女性無料イベントの告知が増加。カップル、女性予約の言及あり。人気単男Aが反応。',
    keywords: ['女性無料', 'カップル', '女性予約', '人気単男A'],
  },
  {
    id: 'post-3',
    storeId: 'd-store',
    source: 'manual',
    postedAt: daysAgoIso(2, 21),
    body: '水曜夜のSM系イベント告知。嗜好ワードは強いが、人数や時間の具体性は控えめ。苦手さんCの話題もあり要確認。',
    keywords: ['SM', 'M', 'S'],
  },
  {
    id: 'post-4',
    storeId: 'a-store',
    source: 'manual',
    postedAt: daysAgoIso(3, 18),
    body: '火曜夜は初参加と女性予約の書き込みが多い。人気単男A、人気単女Bの完全一致ワードが同じスレッドに出現。',
    keywords: ['初参加', '女性予約', '人気単男A', '人気単女B'],
  },
  {
    id: 'post-5',
    storeId: 'c-store',
    source: 'manual',
    postedAt: daysAgoIso(4, 13),
    body: '昼営業の書き込みが増加。主婦、平日昼、予約確定の言及あり。苦手さんCは別店舗側で言及。',
    keywords: ['昼', '主婦', '平日昼', '予約確定'],
  },
  {
    id: 'post-6',
    storeId: 'b-store',
    source: 'manual',
    postedAt: daysAgoIso(5, 22),
    body: '土曜の女性無料イベントは告知量が多い。人気単女Bの名前は出ていないが、女性一人参加ワードあり。',
    keywords: ['女性無料', '女性一人', '土曜'],
  },
  {
    id: 'post-7',
    storeId: 'd-store',
    source: 'manual',
    postedAt: daysAgoIso(6, 20),
    body: '嗜好イベントの前日告知。SM、ソフトSM、限定の表現あり。人気単男Aの参加反応あり。',
    keywords: ['SM', 'ソフトSM', '限定', '人気単男A'],
  },
]

export const storeSituations: StoreSituation[] = [
  {
    id: 'sit-1',
    storeId: 'a-store',
    status: 'event',
    title: '火曜昼イベント継続',
    note: '昼主婦系と初参加ワードが直近投稿で重なっている。昼枠は引き続き観測対象。',
    observedAt: daysAgoIso(0, 12),
  },
  {
    id: 'sit-2',
    storeId: 'b-store',
    status: 'crowded',
    title: '女性無料告知が増加',
    note: '夜帯の書き込み比率が高い。カップル、女性予約の完全一致ワードを継続監視。',
    observedAt: daysAgoIso(1, 20),
  },
  {
    id: 'sit-3',
    storeId: 'd-store',
    status: 'watch',
    title: '嗜好イベントは要確認',
    note: '特定ワードは強いが投稿具体性が低い日がある。盛り上がり判定は追加投稿待ち。',
    observedAt: daysAgoIso(2, 21),
  },
]

export const wordCategories: WordCategory[] = [
  { id: 'beginner', label: '初心者系', examples: ['初心者', '初参加', 'ビギナー'], tier: 'free', hits: 7 },
  { id: 'daytime', label: '昼主婦系', examples: ['昼', '主婦', '人妻', '平日昼'], tier: 'free', hits: 9 },
  { id: 'couple', label: 'カップル系', examples: ['カップル', '夫婦', 'ペア'], tier: 'light', hits: 5 },
  { id: 'female-pr', label: '女性PR系', examples: ['女性来店', '女性予約', '女性無料'], tier: 'light', hits: 12 },
  { id: 'event', label: 'イベント系', examples: ['コスプレ', '仮面', '飲み放題'], tier: 'standard', hits: 4 },
  { id: 'preference', label: 'SM系', examples: ['SM', 'M', 'S', 'ソフトSM'], tier: 'standard', hits: 3 },
]
