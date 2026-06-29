import { z } from 'zod'
import { jsonError } from '@/lib/env'
import { requireAppUser } from '@/lib/server/auth-guard'
import { analyzeTextWithAi } from '@/lib/server/ai'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const payloadSchema = z.object({
  text: z.string().min(1).max(12000),
  postId: z.string().optional(),
  persist: z.boolean().optional(),
})

export async function POST(request: Request) {
  const auth = await requireAppUser()
  if (auth.response) return auth.response

  const parsed = payloadSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return jsonError('自動分析の内容が不正です。', 422, parsed.error.issues)

  const analysis = await analyzeTextWithAi(parsed.data.text)
  const mode = process.env.OPENAI_API_KEY ? 'openai_or_heuristic_fallback' : 'heuristic'

  if (parsed.data.persist) {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = (await supabase?.auth.getUser()) ?? { data: { user: null } }

    if (supabase && user) {
      await supabase.from('ai_analyses').insert({
        user_id: user.id,
        post_id: parsed.data.postId ?? null,
        source_text: parsed.data.text.slice(0, 12000),
        result: analysis,
        mode,
      })
    }
  }

  return Response.json({
    analysis,
    mode,
  })
}
