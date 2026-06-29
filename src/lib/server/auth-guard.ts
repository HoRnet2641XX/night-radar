import { jsonError } from '@/lib/env'
import { getCurrentUser } from '@/lib/supabase/server'

export async function requireAppUser() {
  const user = await getCurrentUser()
  if (!user) {
    return {
      response: jsonError('ログイン後に操作できます。', 401),
      user: null,
    } as const
  }

  return { response: null, user } as const
}
