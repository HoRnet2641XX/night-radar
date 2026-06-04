import type {
  EventInput,
  ExactTermMatch,
  ExactTermSearchGroup,
  PostRecord,
  PrMetrics,
  ScoredEvent,
  SignalTone,
  StoreBbsAnalytics,
  StoreProfile,
  WeekdayPostStat,
} from './types'

const femalePrPattern = /(女性|女の子|女性来店|女性予約|女性無料|女性一人|主婦|人妻|奥様|カップル)/i
const specificityPattern = /(\d+人|\d{1,2}[:時]\d{0,2}|予約|確定|初参加|具体|本日|明日|残り|限定)/i
export const weekdayLabels = ['月曜', '火曜', '水曜', '木曜', '金曜', '土曜', '日曜']

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)))
}

function normalizeBody(body: string) {
  return body.replace(/\s+/g, '').replace(/[0-9０-９]/g, '0').toLowerCase()
}

function referenceTimeForPosts(posts: PostRecord[]) {
  const latest = posts.reduce((max, post) => {
    const time = new Date(post.postedAt).getTime()
    return Number.isNaN(time) ? max : Math.max(max, time)
  }, 0)

  return latest ? latest + 6 * 60 * 60 * 1000 : Date.UTC(2026, 5, 2, 18, 0, 0)
}

function hoursSince(date: string, now: number) {
  const time = new Date(date).getTime()
  if (Number.isNaN(time)) return 72
  return Math.max(0, (now - time) / (1000 * 60 * 60))
}

function weekdayFromDate(date: string) {
  const time = new Date(date)
  if (Number.isNaN(time.getTime())) return '未設定'
  const labels = ['日曜', '月曜', '火曜', '水曜', '木曜', '金曜', '土曜']
  return labels[time.getUTCDay()]
}

function buildSnippet(body: string, term: string) {
  const index = body.indexOf(term)
  if (index < 0) return body.slice(0, 90)
  const start = Math.max(0, index - 32)
  const end = Math.min(body.length, index + term.length + 42)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < body.length ? '…' : ''
  return `${prefix}${body.slice(start, end)}${suffix}`
}

export function toneForScore(score: number): SignalTone {
  if (score >= 84) return 'hot'
  if (score >= 74) return 'warm'
  return 'quiet'
}

export function buildPrMetrics(store: StoreProfile, posts: PostRecord[]): PrMetrics {
  const storePosts = posts.filter((post) => post.storeId === store.id)
  const now = referenceTimeForPosts(posts)
  const postCount = storePosts.length
  const femalePrCount = storePosts.filter((post) => femalePrPattern.test(post.body)).length
  const specificityHits = storePosts.filter((post) => specificityPattern.test(post.body)).length
  const freshnessHits = storePosts.filter((post) => hoursSince(post.postedAt, now) <= 12).length
  const normalized = storePosts.map((post) => normalizeBody(post.body))
  const duplicateCount = normalized.length - new Set(normalized).size

  const specificity = postCount ? clamp((specificityHits / postCount) * 100) : 35
  const freshness = postCount ? clamp((freshnessHits / postCount) * 100) : 30
  const templateRate = postCount ? clamp((duplicateCount / postCount) * 100) : 0
  const femaleRatio = postCount ? femalePrCount / postCount : 0
  const trend = clamp(freshness * 0.55 + femaleRatio * 45)
  const trust = clamp(store.trustSeed + specificity * 0.12 - templateRate * 0.18)

  return {
    postCount,
    femalePrCount,
    specificity,
    freshness,
    templateRate,
    trust,
    trend,
  }
}

export function scoreEvent(event: EventInput, store: StoreProfile, posts: PostRecord[]): ScoredEvent {
  const metrics = buildPrMetrics(store, posts)
  const weekdayBonus = store.strongDays.includes(event.weekday) ? 12 : 0
  const eventBonus = store.strongEvents.includes(event.category) ? 14 : store.weakEvents.includes(event.category) ? -9 : 3
  const sessionBonus =
    (event.session === 'day' && store.hasDaytime) || (event.session === 'night' && store.hasNight) ? 8 : -10
  const postVolumeBonus = Math.min(14, metrics.postCount * 3)
  const femaleSignalBonus = Math.min(16, metrics.femalePrCount * 4)

  const score = clamp(
    28 +
      weekdayBonus +
      eventBonus +
      sessionBonus +
      postVolumeBonus +
      femaleSignalBonus +
      metrics.specificity * 0.12 +
      metrics.freshness * 0.1 +
      metrics.trust * 0.12 -
      metrics.templateRate * 0.08,
  )

  const reasons = [
    weekdayBonus > 0 ? `${event.weekday}との相性が高い` : `${event.weekday}は通常傾向`,
    eventBonus > 8 ? `${event.category}の過去実績が強い` : `${event.category}は要観測`,
    metrics.specificity >= 70 ? '投稿の具体性が高い' : '投稿具体性は中程度',
    metrics.freshness >= 70 ? '直近投稿が動いている' : '鮮度は追加確認が必要',
  ].slice(0, 3)

  return {
    ...event,
    score,
    rank: 0,
    tone: toneForScore(score),
    paidOnly: score < 84,
    store,
    metrics,
    reasons,
  }
}

export function scoreEvents(events: EventInput[], stores: StoreProfile[], posts: PostRecord[]) {
  const storeMap = new Map(stores.map((store) => [store.id, store]))
  const scored = events
    .map((event) => {
      const store = storeMap.get(event.storeId) ?? stores[0]
      return scoreEvent(event, store, posts)
    })
    .toSorted((a, b) => b.score - a.score)

  return scored.map((event, index) => ({
    ...event,
    rank: index + 1,
    paidOnly: index > 1 || event.paidOnly,
  }))
}

export function summarizeSignals(scoredEvents: ScoredEvent[]) {
  const dayTop = scoredEvents.filter((event) => event.session === 'day').toSorted((a, b) => b.score - a.score)[0]
  const nightTop = scoredEvents.filter((event) => event.session === 'night').toSorted((a, b) => b.score - a.score)[0]

  return {
    dayTop,
    nightTop,
    hotCount: scoredEvents.filter((event) => event.tone === 'hot').length,
    paidCount: scoredEvents.filter((event) => event.paidOnly).length,
  }
}

export function parseExactTerms(value: string) {
  return [
    ...new Set(
      value
        .split(/[,\n、]/)
        .map((term) => term.trim())
        .filter(Boolean),
    ),
  ]
}

export function buildStoreBbsAnalytics(stores: StoreProfile[], posts: PostRecord[]): StoreBbsAnalytics[] {
  const totalPosts = Math.max(1, posts.length)

  return stores
    .map((store) => {
      const storePosts = posts.filter((post) => post.storeId === store.id)
      const metrics = buildPrMetrics(store, posts)
      const weekdayStats: WeekdayPostStat[] = weekdayLabels.map((weekday) => {
        const count = storePosts.filter((post) => weekdayFromDate(post.postedAt) === weekday).length
        return {
          weekday,
          count,
          ratio: storePosts.length ? clamp((count / storePosts.length) * 100) : 0,
        }
      })
      const dominantWeekday = weekdayStats.toSorted((a, b) => b.count - a.count)[0]?.weekday ?? '未設定'
      const postRatio = clamp((storePosts.length / totalPosts) * 100)
      const femalePrRatio = storePosts.length ? clamp((metrics.femalePrCount / storePosts.length) * 100) : 0
      const weekdayConcentration = weekdayStats.reduce((max, stat) => Math.max(max, stat.ratio), 0)
      const excitement = clamp(
        postRatio * 0.42 +
          metrics.freshness * 0.22 +
          metrics.specificity * 0.18 +
          femalePrRatio * 0.12 +
          weekdayConcentration * 0.06,
      )
      const verdict = excitement >= 72 ? '盛り上がり強め' : excitement >= 48 ? '検討候補' : '追加観測'

      return {
        store,
        postCount: storePosts.length,
        postRatio,
        excitement,
        femalePrRatio,
        specificity: metrics.specificity,
        dominantWeekday,
        weekdayStats,
        verdict,
      }
    })
    .toSorted((a, b) => b.excitement - a.excitement)
}

export function searchExactBbsTerms(
  posts: PostRecord[],
  stores: StoreProfile[],
  groups: ExactTermSearchGroup[],
): ExactTermMatch[] {
  const storeMap = new Map(stores.map((store) => [store.id, store]))
  const matches: ExactTermMatch[] = []

  groups.forEach((group) => {
    group.terms.forEach((term) => {
      posts.forEach((post) => {
        if (!post.body.includes(term)) return
        const store = storeMap.get(post.storeId)
        if (!store) return

        matches.push({
          id: `${group.group}-${term}-${post.id}`,
          group: group.group,
          groupLabel: group.label,
          term,
          store,
          post,
          snippet: buildSnippet(post.body, term),
        })
      })
    })
  })

  return matches.toSorted((a, b) => new Date(b.post.postedAt).getTime() - new Date(a.post.postedAt).getTime())
}
