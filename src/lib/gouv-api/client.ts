const DATASET = "prix-des-carburants-en-france-flux-instantane-v2";
const RECORDS_URL = `https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/${DATASET}/records`;

const PAGE_SIZE = 100;

type GouvRecordsResponse = {
  total_count?: number;
  results?: unknown[];
};

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Toutes les lignes du flux instantané (sans clé API).
 * @see https://data.economie.gouv.fr/explore/dataset/prix-des-carburants-en-france-flux-instantane-v2
 */
export async function fetchAllGouvInstantaneRecords(
  signal?: AbortSignal,
): Promise<unknown[]> {
  const firstUrl = new URL(RECORDS_URL);
  firstUrl.searchParams.set("limit", String(PAGE_SIZE));
  firstUrl.searchParams.set("offset", "0");

  const firstRes = await fetch(firstUrl.toString(), {
    headers: { Accept: "application/json" },
    signal,
    cache: "no-store",
  });
  if (!firstRes.ok) {
    const t = await firstRes.text();
    throw new Error(`gouv instantané ${firstRes.status}: ${t.slice(0, 200)}`);
  }
  const firstJson = (await firstRes.json()) as GouvRecordsResponse;
  const total = firstJson.total_count ?? 0;
  const firstBatch = firstJson.results ?? [];
  if (total <= PAGE_SIZE || firstBatch.length < PAGE_SIZE) {
    return firstBatch;
  }

  const offsets: number[] = [];
  for (let o = PAGE_SIZE; o < total; o += PAGE_SIZE) {
    offsets.push(o);
  }

  const rest = await mapPool(offsets, 4, async (offset) => {
    const url = new URL(RECORDS_URL);
    url.searchParams.set("limit", String(PAGE_SIZE));
    url.searchParams.set("offset", String(offset));
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal,
      cache: "no-store",
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`gouv instantané offset=${offset} ${res.status}: ${t.slice(0, 160)}`);
    }
    const json = (await res.json()) as GouvRecordsResponse;
    return json.results ?? [];
  });

  return [...firstBatch, ...rest.flat()];
}
