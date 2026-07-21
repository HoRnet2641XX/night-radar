import { adaptEventsToCalendar, adaptNormalizedPostsToRadar } from '@/app/components/data/adapter'
import { getPublicDirectoryState } from '@/lib/public-directory'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams
  const kind = searchParams.get('kind')
  const storeId = searchParams.get('storeId')?.trim()
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

  const normalizedPosts = storeId
    ? state.normalizedPosts.filter((post) => post.storeId === storeId)
    : state.normalizedPosts
  const data = kind === 'posts'
    ? { posts: adaptNormalizedPostsToRadar(normalizedPosts, state.stores, state.dailyInsights) }
    : { events: adaptEventsToCalendar(state.events, state.stores) }
  return Response.json(
    data,
    { headers: { 'Cache-Control': 'private, no-store, max-age=0' } },
  )
}
