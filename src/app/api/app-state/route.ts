import { adaptPublicDirectoryToBars } from '@/app/components/data/adapter'
import { getPublicDirectoryState } from '@/lib/public-directory'

export const runtime = 'nodejs'

export async function GET() {
  const state = await getPublicDirectoryState()
  if (state.mode === 'unavailable') {
    return Response.json({ error: state.connectionNote ?? '最新データを読み込めませんでした。' }, { status: 503 })
  }
  const data = adaptPublicDirectoryToBars(state)
  return Response.json({
    ...data,
    events: data.events.filter((event) => event.date === data.meta.todayKey),
    posts: [],
  })
}
