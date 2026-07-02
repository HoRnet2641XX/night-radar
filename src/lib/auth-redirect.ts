export const authNextCookie = 'night-radar-auth-next'

const defaultAuthedPath = '/app'

export function safeNextPath(value?: string | null) {
  if (!value?.startsWith('/')) return defaultAuthedPath
  if (value.startsWith('//')) return defaultAuthedPath
  if (value.startsWith('/login') || value.startsWith('/signup') || value.startsWith('/auth/verify') || value.startsWith('/auth/complete')) return defaultAuthedPath
  return value
}

export function authRedirectCookieOptions(baseUrl: string) {
  return {
    httpOnly: true,
    maxAge: 10 * 60,
    path: '/',
    sameSite: 'lax' as const,
    secure: baseUrl.startsWith('https://'),
  }
}

export function authErrorMessage(message?: string) {
  const text = message?.trim()
  if (!text) return '認証を開始できませんでした。設定を確認してください。'

  const lower = text.toLowerCase()
  if (lower.includes('missing oauth secret') || lower.includes('unsupported provider')) {
    return '認証プロバイダーのSecretが未設定です。SupabaseのX設定を確認してください。'
  }
  if (lower.includes('redirect') || lower.includes('not allowed')) {
    return '認証後の戻り先URLが許可されていません。SupabaseのRedirect URLsを確認してください。'
  }
  if (lower.includes('email')) return 'メール認証の設定を確認してください。'

  return text
}
