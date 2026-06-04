import { z } from 'zod'
import { events as demoEvents, posts as demoPosts, stores as demoStores } from '@/lib/demo-data'
import { jsonError } from '@/lib/env'
import { persistScoreSnapshot, RepositoryError } from '@/lib/server/repository'
import { scoreEvents } from '@/lib/scoring'
import type { EventInput, PostRecord, StoreProfile } from '@/lib/types'

export const runtime = 'nodejs'

const payloadSchema = z.object({
  stores: z.array(z.any()).optional(),
  events: z.array(z.any()).optional(),
  posts: z.array(z.any()).optional(),
  snapshot: z.boolean().optional(),
})

export async function POST(request: Request) {
  const parsed = payloadSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return jsonError('Invalid scoring payload.', 422, parsed.error.issues)

  const stores = (parsed.data.stores?.length ? parsed.data.stores : demoStores) as StoreProfile[]
  const events = (parsed.data.events?.length ? parsed.data.events : demoEvents) as EventInput[]
  const posts = (parsed.data.posts?.length ? parsed.data.posts : demoPosts) as PostRecord[]

  const scoredEvents = scoreEvents(events, stores, posts)
  let snapshot
  if (parsed.data.snapshot) {
    try {
      snapshot = await persistScoreSnapshot(scoredEvents)
    } catch (error) {
      if (error instanceof RepositoryError) return jsonError(error.message, error.status)
      return jsonError(error instanceof Error ? error.message : 'Score snapshot failed.', 400)
    }
  }

  return Response.json({
    scoredEvents,
    mode: snapshot?.mode,
    saved: snapshot?.saved,
  })
}
