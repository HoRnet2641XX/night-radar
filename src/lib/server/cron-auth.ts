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

export function cronCrawlHttpStatus(failureCount: number, attemptedCount: number) {
  if (failureCount <= 0 || attemptedCount <= 0) return 200
  // A single source can briefly change markup or throttle a request. The run
  // still made useful progress, so external cron monitors should only fail
  // when every attempted source failed.
  return failureCount >= attemptedCount ? 502 : 200
}
