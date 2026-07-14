import { createSupabaseAdminClient } from '@/lib/supabase/server'

export type MaintenanceResult = {
  status: 'completed' | 'unavailable' | 'failed'
  details?: Record<string, unknown>
  message?: string
}

export async function runNightRadarMaintenance(): Promise<MaintenanceResult> {
  const supabase = createSupabaseAdminClient()
  if (!supabase) return { status: 'unavailable', message: 'Supabaseの管理接続が未設定です。' }

  const { data, error } = await supabase.rpc('run_night_radar_retention', {
    snapshot_retention_days: Number(process.env.SNAPSHOT_RETENTION_DAYS) || 14,
    crawl_retention_days: Number(process.env.CRAWL_RUN_RETENTION_DAYS ?? process.env.CRAWL_RETENTION_DAYS) || 30,
    normalized_post_retention_days: Number(process.env.NORMALIZED_POST_RETENTION_DAYS) || 90,
  })

  if (error) return { status: 'failed', message: error.message }
  return { status: 'completed', details: (data ?? {}) as Record<string, unknown> }
}
