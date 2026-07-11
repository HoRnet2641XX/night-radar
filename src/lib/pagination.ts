export type PagedRowsResult<T, E> = {
  data: T[] | null
  error: E | null
}

export async function collectPagedRows<T, E>(
  fetchPage: (from: number, to: number) => PromiseLike<PagedRowsResult<T, E>>,
  pageSize = 1000,
): Promise<PagedRowsResult<T, E>> {
  const rows: T[] = []

  for (let from = 0; ; from += pageSize) {
    const result = await fetchPage(from, from + pageSize - 1)
    if (result.error) return { data: null, error: result.error }

    const page = result.data ?? []
    rows.push(...page)
    if (page.length < pageSize) return { data: rows, error: null }
  }
}
