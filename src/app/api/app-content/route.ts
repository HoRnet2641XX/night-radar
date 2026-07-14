import { adaptEventsToCalendar, adaptNormalizedPostsToRadar } from '@/app/components/data/adapter'
import { getPublicDirectoryState } from '@/lib/public-directory'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const kind = new URL(request.url).searchParams.get('kind')
  if (kind !== 'posts' && kind !== 'events') {
    return Response.json({ error: '取得対象が正しくありません。' }, { status: 400 })
  }

  const state = await getPublicDirectoryState()
  if (state.mode === 'unavailable') {
    return Response.json(
      { error: state.connectionNote ?? '最新データを読み込めませんでした。' },
      { status: 503 },
    )
  }

  const data = kind === 'posts'
    ? { posts: adaptNormalizedPostsToRadar(state.normalizedPosts, state.stores, state.dailyInsights) }
    : { events: adaptEventsToCalendar(state.events, state.stores) }
  return Response.json(
    data,
    { headers: { 'Cache-Control': 'private, no-store, max-age=0' } },
  )
}
