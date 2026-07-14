import { createClient } from '@supabase/supabase-js'

const BATCH_SIZE = 200

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('SupabaseのURLとサービスロールキーが必要です。')

const database = createClient(url, key, { auth: { persistSession: false } })
let cleared = 0

for (;;) {
  const { data: rows, error: selectError } = await database
    .from('bbs_snapshots')
    .select('id')
    .like('screenshot_data_url', 'data:image/svg+xml%')
    .order('captured_at', { ascending: false })
    .limit(BATCH_SIZE)
  if (selectError) throw selectError
  if (!rows?.length) break

  const { error: updateError } = await database
    .from('bbs_snapshots')
    .update({ screenshot_data_url: null })
    .in('id', rows.map((row) => row.id))
  if (updateError) throw updateError

  cleared += rows.length
  console.log(`旧形式画像を${cleared}件整理しました。`)
}

console.log(JSON.stringify({ cleared }))
