export function isProductionRuntime() {
  return process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL_ENV || process.env.VERCEL)
}

export function getCronAuthorizationError(request: Request, purpose: string) {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) {
    return isProductionRuntime() ? `本番環境で${purpose}を実行するにはCRON_SECRETの設定が必要です。` : null
  }
  return request.headers.get('authorization') === `Bearer ${secret}`
    ? null
    : `${purpose}の認証に失敗しました。`
}

export function cronCrawlHttpStatus(failureCount: number) {
  return failureCount > 0 ? 502 : 200
}
