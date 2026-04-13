const DEFAULT_BASE = "https://api.prix-carburants.2aaz.fr";

export function getFuelApiBase(): string {
  const b = process.env.FUEL_API_BASE?.trim() || DEFAULT_BASE;
  return b.replace(/\/$/, "");
}

export function getFuelApiKey(): string | undefined {
  const k = process.env.FUEL_API_KEY?.trim();
  return k || undefined;
}

function authHeaders(): HeadersInit {
  const key = getFuelApiKey();
  const h: Record<string, string> = { Accept: "application/json" };
  if (key) h.Authorization = `Key ${key}`;
  return h;
}

const PAGE_SIZE = 20;

/**
 * Récupère toutes les pages de stations pour un département (Range 1-based, cf. API 2aaz).
 */
export async function fetchStationsForDepartment(
  department: string,
  signal?: AbortSignal,
): Promise<unknown[]> {
  const base = getFuelApiBase();
  const key = getFuelApiKey();
  if (!key) {
    throw new Error("FUEL_API_KEY manquant : la liste des stations renvoie [] sans clé valide.");
  }

  const all: unknown[] = [];
  let start = 1;

  for (;;) {
    const end = start + PAGE_SIZE - 1;
    const url = new URL(`${base}/stations/`);
    url.searchParams.set("q", "fr");
    url.searchParams.append("departments", department);
    url.searchParams.append("responseFields", "Fuels");
    url.searchParams.append("responseFields", "Price");

    const res = await fetch(url.toString(), {
      headers: {
        ...authHeaders(),
        Range: `station=${start}-${end}`,
      },
      signal,
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`stations dept ${department} ${res.status}: ${text.slice(0, 200)}`);
    }

    const batch: unknown = await res.json();
    const list = Array.isArray(batch) ? batch : [];
    if (list.length === 0) break;
    all.push(...list);

    if (list.length < PAGE_SIZE) break;
    if (res.status !== 206 && list.length === PAGE_SIZE) {
      start += PAGE_SIZE;
      continue;
    }
    if (res.status === 206) {
      start += PAGE_SIZE;
      continue;
    }
    break;
  }

  return all;
}
