// Supabase caps a single read (usually at 1000 rows). Page through with .range() for reports that
// must include every row. `build` must return a fresh, ordered query each time.
type RangeQuery<T> = { range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }> };

export async function fetchAllRows<T>(build: () => RangeQuery<T>, pageSize = 1000, maxRows = 20000): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1);
    if (error || !data) break;
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return rows;
}
