import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { hasSupabaseEnv } from '../env'

export async function createSupabaseServerClient() {
  if (!hasSupabaseEnv()) return null

  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {
            // Server Components cannot always set cookies; route handlers can.
          }
        },
      },
    },
  )
}

export function createSupabaseAdminClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null

  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    cookies: {
      getAll() {
        return []
      },
      setAll() {},
    },
  })
}

export async function getCurrentUser() {
  const supabase = await createSupabaseServerClient()
  if (!supabase) return null

  const {
    data: { user },
  } = await supabase.auth.getUser()

  return user
}
