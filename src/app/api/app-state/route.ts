import { getDashboardState } from '@/lib/server/repository'

export const runtime = 'nodejs'

export async function GET() {
  return Response.json(await getDashboardState())
}
