export function normalizeStoreSearchText(value: string) {
  return value.normalize('NFKC').replace(/\s+/g, '').toLocaleLowerCase('ja-JP')
}

export function matchesStoreSearch(query: string, values: Array<string | null | undefined>) {
  const normalizedQuery = normalizeStoreSearchText(query)
  if (!normalizedQuery) return true
  return values.some((value) => value && normalizeStoreSearchText(value).includes(normalizedQuery))
}
