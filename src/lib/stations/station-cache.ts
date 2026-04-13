import type { StationSourceKind } from "./station-source";
import type { NormalizedStation } from "./types";

type CacheEntry = { at: number; kind: StationSourceKind; data: NormalizedStation[] };

let memory: CacheEntry | null = null;

const TTL_MS = 15 * 60 * 1000;

export function readStationCache(kind: StationSourceKind): NormalizedStation[] | null {
  if (!memory) return null;
  if (memory.kind !== kind) return null;
  if (Date.now() - memory.at > TTL_MS) {
    memory = null;
    return null;
  }
  return memory.data;
}

export function writeStationCache(kind: StationSourceKind, data: NormalizedStation[]): void {
  memory = { at: Date.now(), kind, data };
}

export function clearStationCache(): void {
  memory = null;
}
