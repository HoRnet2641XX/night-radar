import { requireAppUser } from '@/lib/server/auth-guard'
import { getDashboardState } from '@/lib/server/repository'

export const runtime = 'nodejs'

export async function GET() {
  const auth = await requireAppUser()
  if (auth.response) return auth.response

  return Response.json(await getDashboardState())
}
