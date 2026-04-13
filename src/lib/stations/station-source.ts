import { fetchAllGouvInstantaneRecords } from "@/lib/gouv-api/client";
import { fetchStationsForDepartment, getFuelApiKey } from "@/lib/fuel-api/client";
import { FRANCE_DEPARTMENT_CODES } from "@/lib/fr-departments";
import { normalizeGouvInstantaneRecord } from "./gouv-normalize";
import { normalizeStation } from "./normalize";
import type { NormalizedStation } from "./types";

export type StationSourceKind = "gouv" | "twoaaz";

export interface StationSource {
  readonly kind: StationSourceKind;
  /** Toutes les stations France (source gouv ou 2aaz). */
  fetchAllStations(options?: { signal?: AbortSignal }): Promise<NormalizedStation[]>;
}

export function getStationSourceKind(): StationSourceKind {
  const v = process.env.STATION_SOURCE?.trim().toLowerCase();
  if (v === "twoaaz") return "twoaaz";
  return "gouv";
}

const CONCURRENCY = 3;

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export class GouvStationSource implements StationSource {
  readonly kind = "gouv" as const;

  async fetchAllStations(options?: { signal?: AbortSignal }): Promise<NormalizedStation[]> {
    const rows = await fetchAllGouvInstantaneRecords(options?.signal);
    const out: NormalizedStation[] = [];
    for (const raw of rows) {
      const s = normalizeGouvInstantaneRecord(raw);
      if (s) out.push(s);
    }
    return out;
  }
}

export class TwoAazStationSource implements StationSource {
  readonly kind = "twoaaz" as const;

  async fetchAllStations(options?: { signal?: AbortSignal }): Promise<NormalizedStation[]> {
    const signal = options?.signal;
    const byDept = await mapPool(
      FRANCE_DEPARTMENT_CODES,
      CONCURRENCY,
      async (dept) => {
        try {
          return await fetchStationsForDepartment(dept, signal);
        } catch {
          return [];
        }
      },
    );

    const merged = new Map<number, NormalizedStation>();
    for (const rows of byDept) {
      for (const raw of rows) {
        const s = normalizeStation(raw);
        if (!s) continue;
        merged.set(s.id, s);
      }
    }
    return [...merged.values()];
  }
}

export function createStationSource(): StationSource {
  return getStationSourceKind() === "twoaaz"
    ? new TwoAazStationSource()
    : new GouvStationSource();
}

export function assertTwoAazConfigured(): void {
  if (!getFuelApiKey()) {
    throw new Error(
      "STATION_SOURCE=twoaaz nécessite FUEL_API_KEY (clé API 2aaz) dans .env.local.",
    );
  }
}
