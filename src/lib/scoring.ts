import type {
  BbsSnapshot,
  BbsSnapshotMetrics,
  EventInput,
  ExactTermMatch,
  ExactTermSearchGroup,
  PostRecord,
  PrMetrics,
  ScoredEvent,
  SignalTone,
  StoreBbsAnalytics,
  StoreRadarPoint,
  StoreProfile,
  VisitForecast,
  WatchedWordHit,
  WeekdayPostStat,
  WordBookmark,
} from './types'

const femalePrPattern = /(女性|女の子|女性来店|女性予約|女性無料|女性一人|主婦|人妻|奥様|カップル)/i
const specificityPattern = /(\d+人|\d{1,2}[:時]\d{0,2}|予約|確定|初参加|具体|本日|明日|残り|限定)/i
const femaleOnlyPattern = /女性/g
const firstVisitPattern = /(初めて|はじめて|初参加|初来店)/g
const comebackPattern = /((\d+|[０-９]+|[一二三四五六七八九十百]+)\s*(年|ヶ月|か月|カ月|月|週間|日)\s*ぶり|久しぶり|以来)/g
const groupVisitPattern = /((\d+|[０-９]+|[二三四五六七八九十]+)\s*人組|二人組|三人組|複数人|友達と|ペア)/g
const emojiPattern = /(\p{Extended_Pictographic}|[\u{1F300}-\u{1FAFF}]|[（(][^（）()]{0,10}[;；:：=xX＾^・ω∀Д▽△_<>><][^（）()]{0,10}[）)])/gu

export const weekdayLabels = ['月曜', '火曜', '水曜', '木曜', '金曜', '土曜', '日曜']

export const defaultWatchedWordLabels = [
  '女性',
  '初めて/はじめて',
  '久しぶり',
  '複数人',
  '絵文字/顔文字',
] as const

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

function countMatches(body: string, pattern: RegExp) {
  return [...body.matchAll(pattern)].length
}

function mergeMetrics(metrics: BbsSnapshotMetrics[]) {
  return metrics.reduce<BbsSnapshotMetrics>(
    (total, metric) => ({
      femaleOnly: total.femaleOnly + metric.femaleOnly,
      firstVisit: total.firstVisit + metric.firstVisit,
      comeback: total.comeback + metric.comeback,
      groupVisit: total.groupVisit + metric.groupVisit,
      emoji: total.emoji + metric.emoji,
      totalSignals: total.totalSignals + metric.totalSignals,
      textLength: total.textLength + metric.textLength,
    }),
    {
      femaleOnly: 0,
      firstVisit: 0,
      comeback: 0,
      groupVisit: 0,
      emoji: 0,
      totalSignals: 0,
      textLength: 0,
    },
  )
}

export function buildBbsSnapshotMetrics(text: string): BbsSnapshotMetrics {
  const femaleOnly = countMatches(text, femaleOnlyPattern)
  const firstVisit = countMatches(text, firstVisitPattern)
  const comeback = countMatches(text, comebackPattern)
  const groupVisit = countMatches(text, groupVisitPattern)
  const emoji = countMatches(text, emojiPattern)

  return {
    femaleOnly,
    firstVisit,
    comeback,
    groupVisit,
    emoji,
    totalSignals: femaleOnly + firstVisit + comeback + groupVisit + emoji,
    textLength: text.length,
  }
}

export function scoreBbsSnapshot(metrics: BbsSnapshotMetrics) {
  return clamp(
    22 +
      metrics.femaleOnly * 7 +
      metrics.firstVisit * 10 +
      metrics.comeback * 8 +
      metrics.groupVisit * 9 +
      metrics.emoji * 3 +
      Math.min(18, metrics.textLength / 220),
  )
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

export function buildStoreRadarPoints(stores: StoreProfile[], posts: PostRecord[], snapshots: BbsSnapshot[] = []): StoreRadarPoint[] {
  const analytics = buildStoreBbsAnalytics(stores, posts)
  const totalBase = Math.max(
    1,
    stores.reduce((sum, store) => {
      const storeSnapshots = snapshots.filter((snapshot) => snapshot.storeId === store.id)
      const snapshotScore = storeSnapshots.reduce((max, snapshot) => Math.max(max, snapshot.radarScore), 0)
      const analytic = analytics.find((item) => item.store.id === store.id)
      return sum + Math.max(snapshotScore, analytic?.excitement ?? 0)
    }, 0),
  )

  return stores
    .map((store) => {
      const analytic = analytics.find((item) => item.store.id === store.id)
      const storeSnapshots = snapshots.filter((snapshot) => snapshot.storeId === store.id)
      const mergedSignals = mergeMetrics([
        ...storeSnapshots.map((snapshot) => snapshot.metrics),
        ...posts.filter((post) => post.storeId === store.id).map((post) => buildBbsSnapshotMetrics(post.body)),
      ])
      const latestSnapshot = storeSnapshots.toSorted(
        (a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime(),
      )[0]
      const snapshotScore = storeSnapshots.reduce((max, snapshot) => Math.max(max, snapshot.radarScore), 0)
      const score = clamp(Math.max(snapshotScore, analytic?.excitement ?? 0) + Math.min(12, mergedSignals.totalSignals * 1.2))

      return {
        store,
        score,
        tone: toneForScore(score),
        share: clamp((score / totalBase) * 100),
        rank: 0,
        postCount: analytic?.postCount ?? 0,
        snapshotCount: storeSnapshots.length,
        lastCapturedAt: latestSnapshot?.capturedAt,
        signals: mergedSignals,
        verdict: score >= 78 ? 'Hot' : score >= 52 ? '検討余地' : '様子見',
      }
    })
    .toSorted((a, b) => b.score - a.score)
    .map((point, index) => ({ ...point, rank: index + 1 }))
}

export function buildWatchedWordHits(posts: PostRecord[], stores: StoreProfile[], bookmarks: WordBookmark[] = []): WatchedWordHit[] {
  const storeMap = new Map(stores.map((store) => [store.id, store]))
  const rules: Array<{ label: string; term: string; pattern: RegExp; severity: WatchedWordHit['severity'] }> = [
    { label: '女性のみ', term: '女性', pattern: /女性/g, severity: 'medium' },
    { label: '初めて', term: '初めて', pattern: firstVisitPattern, severity: 'high' },
    { label: '久しぶり', term: '久しぶり', pattern: comebackPattern, severity: 'high' },
    { label: '複数人', term: '2人組', pattern: groupVisitPattern, severity: 'medium' },
    { label: '絵文字/顔文字', term: 'emoji', pattern: emojiPattern, severity: 'low' },
  ]

  bookmarks.forEach((bookmark) => {
    if (!bookmark.pattern.trim()) return
    const escaped = bookmark.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    try {
      rules.push({
        label: bookmark.label || bookmark.pattern,
        term: bookmark.pattern,
        pattern: bookmark.matchType === 'regex' ? new RegExp(bookmark.pattern, 'g') : new RegExp(escaped, 'g'),
        severity: 'medium',
      })
    } catch {
      rules.push({
        label: bookmark.label || bookmark.pattern,
        term: bookmark.pattern,
        pattern: new RegExp(escaped, 'g'),
        severity: 'medium',
      })
    }
  })

  const hits: WatchedWordHit[] = []
  posts.forEach((post) => {
    const store = storeMap.get(post.storeId)
    if (!store) return
    rules.forEach((rule) => {
      const matches = [...post.body.matchAll(rule.pattern)]
      matches.slice(0, 3).forEach((match, index) => {
        const term = match[0] || rule.term
        hits.push({
          id: `${post.id}-${rule.label}-${index}`,
          label: rule.label,
          term,
          store,
          post,
          snippet: buildSnippet(post.body, term === 'emoji' ? term : term.slice(0, 16)),
          severity: rule.severity,
        })
      })
    })
  })

  return hits.toSorted((a, b) => new Date(b.post.postedAt).getTime() - new Date(a.post.postedAt).getTime())
}

export function buildVisitForecasts(events: EventInput[], stores: StoreProfile[], posts: PostRecord[]): VisitForecast[] {
  const watchedHits = buildWatchedWordHits(posts, stores)
  return scoreEvents(events, stores, posts)
    .map((event) => {
      const watchedSignalCount = watchedHits.filter((hit) => hit.store.id === event.storeId).length
      const score = clamp(event.score + Math.min(12, watchedSignalCount * 2))
      return {
        id: event.id,
        store: event.store,
        event,
        score,
        rank: 0,
        dateLabel: event.date,
        timeLabel: event.startsAt,
        watchedSignalCount,
        reasons: [
          ...event.reasons,
          watchedSignalCount ? `注目ワード ${watchedSignalCount}件` : '注目ワードは少なめ',
        ].slice(0, 4),
      }
    })
    .toSorted((a, b) => b.score - a.score)
    .map((forecast, index) => ({ ...forecast, rank: index + 1 }))
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
