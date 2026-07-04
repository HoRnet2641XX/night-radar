import { getPublicDirectoryState, storeDetailPath } from '@/lib/public-directory'

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://night-radar.vercel.app'

export const revalidate = 120

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export async function GET() {
  const state = await getPublicDirectoryState()
  const items = state.summaries.slice(0, 20).map((summary) => {
    const url = `${baseUrl}${storeDetailPath(summary.store)}`
    return `
      <item>
        <title>${escapeXml(summary.store.name)}の更新</title>
        <link>${escapeXml(url)}</link>
        <guid>${escapeXml(url)}</guid>
        <pubDate>${new Date(summary.lastUpdatedAt ?? state.generatedAt).toUTCString()}</pubDate>
        <description>${escapeXml(`${summary.temperatureLabel}。${summary.primaryReason}`)}</description>
      </item>`
  })

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <rss version="2.0">
    <channel>
      <title>Night Radar 更新フィード</title>
      <link>${escapeXml(baseUrl)}</link>
      <description>公開店舗の更新、イベント、BBS巡回の要約</description>
      <language>ja</language>
      <lastBuildDate>${new Date(state.generatedAt).toUTCString()}</lastBuildDate>
      ${items.join('')}
    </channel>
  </rss>`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 's-maxage=300, stale-while-revalidate=600',
    },
  })
}
