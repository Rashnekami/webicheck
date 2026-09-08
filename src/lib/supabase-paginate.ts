/**
 * Reads every row of a Supabase query in pages.
 *
 * PostgREST caps a single response (1000 rows by default), so a fixed
 * `.limit(1000)` silently hides records once a provider grows past that mark.
 * The builder receives the row window and must return the query for it.
 */
export async function fetchAllPages<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 1000,
  maxPages = 50,
): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize;
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw error;
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return rows;
}
