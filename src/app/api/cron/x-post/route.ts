import { getPublicDirectoryState } from '@/lib/public-directory'
import { getCronAuthorizationError } from '@/lib/server/cron-auth'
import { dispatchOperationalAlert } from '@/lib/server/notifications'
import {
  getXAutoPostConfig,
  inferXAutoPostSlot,
  parseXAutoPostSlot,
  prepareXScheduledPost,
  publishXPost,
  XAutoPostPlanError,
  xWeightedLength,
} from '@/lib/server/x-auto-post'
import { createSupabaseAdminClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const maxDuration = 30

type XPostRow = {
  id: string
  idempotency_key: string
  status: 'processing' | 'posted' | 'failed'
  content?: string | null
  content_hash?: string | null
  x_post_id?: string | null
  x_post_url?: string | null
  metrics?: unknown
  attempts?: number | null
  error_message?: string | null
  created_at: string
  updated_at: string
}

type PublishedXPost = {
  postId: string
  url: string
}

function isMissingRelationError(error?: { code?: string; message?: string } | null) {
  if (!error) return false
  return error.code === '42P01' || error.code === 'PGRST205' || /x_auto_posts.*does not exist|Could not find the table/i.test(error.message ?? '')
}

function isUnsupportedPostKindError(error?: { code?: string; message?: string } | null) {
  if (!error) return false
  return error.code === '23514' && /x_auto_posts_post_kind_check/i.test(error.message ?? '')
}

function publicPlan(plan: ReturnType<typeof prepareXScheduledPost>) {
  return {
    slot: plan.slot,
    kind: plan.kind,
    targetDateKey: plan.targetDateKey,
    scheduledFor: plan.scheduledFor,
    sourceGeneratedAt: plan.sourceGeneratedAt,
    text: plan.text,
    replyTexts: plan.replyTexts,
    threadTexts: plan.threadTexts,
    weightedLength: plan.weightedLength,
    weightedLengths: plan.weightedLengths,
    candidates: plan.candidates,
    weeklyCandidates: plan.weeklyCandidates,
    hiddenGemCandidates: plan.hiddenGemCandidates,
    eventHighlights: plan.eventHighlights,
    eligibleStoreCount: plan.eligibleStoreCount,
    weeklyEligibleStoreCount: plan.weeklyEligibleStoreCount,
    hiddenGemEligibleStoreCount: plan.hiddenGemEligibleStoreCount,
  }
}

function planMetrics(
  plan: ReturnType<typeof prepareXScheduledPost>,
  publishedPosts: PublishedXPost[] = [],
  threadTexts: string[] = plan.threadTexts,
) {
  return {
    candidates: plan.candidates,
    weeklyCandidates: plan.weeklyCandidates,
    hiddenGemCandidates: plan.hiddenGemCandidates,
    eventHighlights: plan.eventHighlights,
    eligibleStoreCount: plan.eligibleStoreCount,
    weeklyEligibleStoreCount: plan.weeklyEligibleStoreCount,
    hiddenGemEligibleStoreCount: plan.hiddenGemEligibleStoreCount,
    weightedLength: plan.weightedLength,
    weightedLengths: threadTexts.map(xWeightedLength),
    threadTexts,
    publishedPosts,
  }
}

function storedMetrics(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function storedThreadTexts(row: XPostRow, fallback: string[]) {
  const value = storedMetrics(row.metrics).threadTexts
  if (!Array.isArray(value)) return fallback
  const texts = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  return texts.length ? texts : fallback
}

function storedPublishedPosts(row: XPostRow) {
  const value = storedMetrics(row.metrics).publishedPosts
  const posts = Array.isArray(value)
    ? value.flatMap((item) => {
        if (!item || typeof item !== 'object') return []
        const postId = 'postId' in item && typeof item.postId === 'string' ? item.postId : ''
        const url = 'url' in item && typeof item.url === 'string' ? item.url : ''
        return postId ? [{ postId, url: url || `https://x.com/i/web/status/${postId}` }] : []
      })
    : []
  if (!posts.length && row.x_post_id) {
    return [{ postId: row.x_post_id, url: row.x_post_url || `https://x.com/i/web/status/${row.x_post_id}` }]
  }
  return posts
}

async function existingRun(supabase: NonNullable<ReturnType<typeof createSupabaseAdminClient>>, key: string) {
  const result = await supabase
    .from('x_auto_posts')
    .select('id,idempotency_key,status,content,content_hash,x_post_id,x_post_url,metrics,attempts,error_message,created_at,updated_at')
    .eq('idempotency_key', key)
    .maybeSingle()
  return { row: result.data as XPostRow | null, error: result.error }
}

export async function GET(request: Request) {
  const authorizationError = getCronAuthorizationError(request, 'X自動投稿')
  if (authorizationError) {
    return Response.json(
      { error: authorizationError },
      { status: authorizationError.includes('CRON_SECRET') ? 503 : 401 },
    )
  }

  const url = new URL(request.url)
  const previewOnly = ['1', 'true'].includes(url.searchParams.get('dryRun') ?? '')
  const retryFailed = ['1', 'true'].includes(url.searchParams.get('retry') ?? '')
  const pathSlot = parseXAutoPostSlot(url.pathname.split('/').filter(Boolean).at(-1))
  const slot = parseXAutoPostSlot(url.searchParams.get('slot')) ?? pathSlot ?? inferXAutoPostSlot()
  const config = getXAutoPostConfig()

  let plan: ReturnType<typeof prepareXScheduledPost>
  try {
    plan = prepareXScheduledPost(await getPublicDirectoryState(), slot, {
      includeUrl: config.includeUrl,
      targetUrl: config.targetUrl,
      minimumDataConfidence: config.minimumDataConfidence,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'X投稿候補を作成できませんでした。'
    if (!previewOnly && config.enabled) {
      await dispatchOperationalAlert({ title: 'X自動投稿を見送りました', body: message, severity: 'warning' })
    }
    return Response.json(
      { status: 'skipped', reason: error instanceof XAutoPostPlanError ? error.code : 'plan_failed', message },
      { status: previewOnly || !config.enabled ? 200 : 503 },
    )
  }

  if (previewOnly || !config.enabled) {
    return Response.json({
      status: previewOnly ? 'preview' : 'disabled',
      message: previewOnly ? '投稿せずに文面だけ確認しました。' : 'X_AUTO_POST_ENABLEDが有効になるまで投稿しません。',
      configuration: {
        enabled: config.enabled,
        credentialsConfigured: config.credentialsConfigured,
        includeUrl: config.includeUrl,
      },
      plan: publicPlan(plan),
    })
  }

  if (!config.credentialsConfigured) {
    return Response.json({ error: 'X APIの4つの認証情報が不足しています。' }, { status: 503 })
  }

  const supabase = createSupabaseAdminClient()
  if (!supabase) return Response.json({ error: 'Supabaseの管理接続が未設定です。' }, { status: 503 })

  const existing = await existingRun(supabase, plan.idempotencyKey)
  if (isMissingRelationError(existing.error)) {
    return Response.json({
      error: 'X投稿履歴テーブルが未作成です。supabase/migrations/20260715_x_auto_posts.sql を適用してください。',
    }, { status: 503 })
  }
  if (existing.error) return Response.json({ error: existing.error.message }, { status: 500 })

  let claimedRow: XPostRow
  if (existing.row) {
    if (existing.row.status !== 'failed' || !retryFailed) {
      return Response.json({
        status: 'skipped',
        reason: 'already_claimed',
        message: existing.row.status === 'posted' ? '本日分は投稿済みです。' : '本日分は処理済み、または処理中です。',
        run: existing.row,
      })
    }
    const retryResult = await supabase
      .from('x_auto_posts')
      .update({ status: 'processing', error_message: null, attempts: (existing.row.attempts ?? 1) + 1 })
      .eq('id', existing.row.id)
      .eq('status', 'failed')
      .select('id,idempotency_key,status,content,content_hash,x_post_id,x_post_url,metrics,attempts,error_message,created_at,updated_at')
      .maybeSingle()
    if (retryResult.error) return Response.json({ error: retryResult.error.message }, { status: 500 })
    const retriedRow = retryResult.data as XPostRow | null
    if (!retriedRow) return Response.json({ status: 'skipped', reason: 'retry_already_claimed' })
    claimedRow = retriedRow
  } else {
    const claimResult = await supabase
      .from('x_auto_posts')
      .insert({
        idempotency_key: plan.idempotencyKey,
        post_kind: plan.kind,
        scheduled_for: plan.scheduledFor,
        content: plan.threadTexts.join('\n\n--- 返信 ---\n\n'),
        content_hash: plan.contentHash,
        status: 'processing',
        source_generated_at: plan.sourceGeneratedAt,
        metrics: planMetrics(plan),
        attempts: 1,
      })
      .select('id,idempotency_key,status,content,content_hash,x_post_id,x_post_url,metrics,attempts,error_message,created_at,updated_at')
      .single()
    if (claimResult.error?.code === '23505') {
      const duplicate = await existingRun(supabase, plan.idempotencyKey)
      return Response.json({ status: 'skipped', reason: 'already_claimed', run: duplicate.row })
    }
    if (isMissingRelationError(claimResult.error)) {
      return Response.json({
        error: 'X投稿履歴テーブルが未作成です。supabase/migrations/20260715_x_auto_posts.sql を適用してください。',
      }, { status: 503 })
    }
    if (isUnsupportedPostKindError(claimResult.error)) {
      return Response.json({
        error: 'X投稿履歴テーブルを3種類の投稿へ更新してください。supabase/migrations/20260716_expand_x_auto_post_kinds.sql を適用してください。',
      }, { status: 503 })
    }
    if (claimResult.error) return Response.json({ error: claimResult.error.message }, { status: 500 })
    claimedRow = claimResult.data as XPostRow
  }

  try {
    const threadTexts = storedThreadTexts(claimedRow, plan.threadTexts)
    const publishedPosts = storedPublishedPosts(claimedRow)
    for (let index = publishedPosts.length; index < threadTexts.length; index += 1) {
      const replyToPostId = index > 0 ? publishedPosts[index - 1]?.postId : undefined
      if (index > 0 && !replyToPostId) throw new Error('返信先のX投稿IDを確認できませんでした。')
      const posted = await publishXPost(threadTexts[index]!, replyToPostId)
      publishedPosts.push(posted)
      const progressResult = await supabase
        .from('x_auto_posts')
        .update({
          x_post_id: publishedPosts[0]?.postId,
          x_post_url: publishedPosts[0]?.url,
          metrics: planMetrics(plan, publishedPosts, threadTexts),
        })
        .eq('id', claimedRow.id)
      if (progressResult.error) {
        await dispatchOperationalAlert({
          title: 'Xスレッド投稿後の進行保存に失敗しました',
          body: `${publishedPosts.length}/${threadTexts.length}投稿目まで送信済みです。${progressResult.error.message}`,
          severity: 'error',
        })
        return Response.json({
          status: 'posted_partial',
          warning: '投稿は送信されましたが、進行状況を保存できませんでした。手動で履歴を確認してください。',
          posts: publishedPosts,
        }, { status: 500 })
      }
    }

    const updateResult = await supabase
      .from('x_auto_posts')
      .update({
        status: 'posted',
        x_post_id: publishedPosts[0]?.postId,
        x_post_url: publishedPosts[0]?.url,
        metrics: planMetrics(plan, publishedPosts, threadTexts),
        posted_at: new Date().toISOString(),
      })
      .eq('id', claimedRow.id)
    if (updateResult.error) {
      await dispatchOperationalAlert({
        title: 'X投稿後の履歴保存に失敗しました',
        body: `X投稿ID ${publishedPosts[0]?.postId ?? '不明'} の履歴を確認してください。${updateResult.error.message}`,
        severity: 'error',
      })
      return Response.json({ status: 'posted', warning: '履歴更新に失敗しました。', posts: publishedPosts }, { status: 500 })
    }
    return Response.json({ status: 'posted', post: publishedPosts[0], posts: publishedPosts, plan: publicPlan(plan) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'X APIへの投稿に失敗しました。'
    await supabase.from('x_auto_posts').update({ status: 'failed', error_message: message }).eq('id', claimedRow.id)
    await dispatchOperationalAlert({ title: 'X自動投稿に失敗しました', body: message, severity: 'error' })
    return Response.json({ status: 'failed', error: message }, { status: 502 })
  }
}
