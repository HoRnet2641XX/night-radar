import { createClient } from '@supabase/supabase-js'
import { resolvedStoreMetadata } from '../src/lib/store-catalog.ts'

const apply = process.argv.includes('--apply')
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceRoleKey) {
  console.error('NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です。')
  process.exit(1)
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function toStore(row) {
  return {
    id: row.id,
    name: row.name,
    area: row.area || '未設定',
    address: row.address || undefined,
    nearestStation: row.nearest_station || undefined,
    phone: row.phone || undefined,
    officialUrl: row.official_url || undefined,
    mapUrl: row.map_url || undefined,
    priceNote: row.price_note || undefined,
    tags: [],
    hasDaytime: false,
    hasNight: true,
    openingHourDay: '13:00',
    openingHourNight: '19:00',
    prStructure: '未分類',
    strongDays: [],
    strongEvents: [],
    weakEvents: [],
    trustSeed: 60,
  }
}

function updatePayload(row) {
  const resolved = resolvedStoreMetadata(toStore(row))
  const payload = {}
  const fields = [
    ['area', 'area'],
    ['address', 'address'],
    ['nearest_station', 'nearestStation'],
    ['phone', 'phone'],
    ['official_url', 'officialUrl'],
    ['map_url', 'mapUrl'],
    ['price_note', 'priceNote'],
  ]

  for (const [databaseKey, storeKey] of fields) {
    const current = row[databaseKey]
    const next = resolved[storeKey]
    if (databaseKey === 'area' && next === 'エリア未確認') continue
    const areaCanBeReplaced = databaseKey === 'area' && ['', '未設定', '都内', '東京'].includes(current || '')
    if (next && next !== current && (!current || areaCanBeReplaced)) payload[databaseKey] = next
  }
  return payload
}

async function main() {
  const { data, error } = await supabase
    .from('stores')
    .select('id,name,area,address,nearest_station,phone,official_url,map_url,price_note')
    .order('name')

  if (error) throw error

  const changes = (data ?? [])
    .map((row) => ({ id: row.id, name: row.name, payload: updatePayload(row) }))
    .filter((item) => Object.keys(item.payload).length > 0)

  if (apply) {
    for (const item of changes) {
      const { error: updateError } = await supabase.from('stores').update(item.payload).eq('id', item.id)
      if (updateError) throw new Error(`${item.name}: ${updateError.message}`)
    }
  }

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    stores: data?.length ?? 0,
    changedStores: changes.length,
    changedFields: changes.reduce((sum, item) => sum + Object.keys(item.payload).length, 0),
    changes,
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
