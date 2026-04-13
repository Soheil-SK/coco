import type { NormalizedStation, StationFuel } from "./types";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function readNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number.parseFloat(v.replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function ruptureActive(r: Record<string, unknown>, ruptKey: string): boolean {
  const v = r[ruptKey];
  if (v == null) return false;
  const s = String(v).trim();
  return s.length > 0;
}

const FUEL_SPECS = [
  { fuelId: 1, shortName: "Gazole", prixKey: "gazole_prix", ruptKey: "gazole_rupture_type" },
  { fuelId: 2, shortName: "SP95", prixKey: "sp95_prix", ruptKey: "sp95_rupture_type" },
  { fuelId: 3, shortName: "E85", prixKey: "e85_prix", ruptKey: "e85_rupture_type" },
  { fuelId: 4, shortName: "GPLc", prixKey: "gplc_prix", ruptKey: "gplc_rupture_type" },
  { fuelId: 5, shortName: "SP95-E10", prixKey: "e10_prix", ruptKey: "e10_rupture_type" },
  { fuelId: 6, shortName: "SP98", prixKey: "sp98_prix", ruptKey: "sp98_rupture_type" },
] as const;

export function normalizeGouvInstantaneRecord(raw: unknown): NormalizedStation | null {
  if (!isRecord(raw)) return null;
  const id = readNumber(raw.id);
  if (id === undefined) return null;

  let lat: number | undefined;
  let lng: number | undefined;

  const geom = raw.geom;
  if (isRecord(geom)) {
    lat = readNumber(geom.lat);
    lng = readNumber(geom.lon);
  }

  // Fallback: latitude/longitude top-level, encodés ×100 000 (ex. "4331600" → 43.316)
  if (lat === undefined || lng === undefined) {
    const rawLat = readNumber(raw.latitude);
    const rawLng = readNumber(raw.longitude);
    if (rawLat !== undefined && rawLng !== undefined) {
      lat = rawLat / 100_000;
      lng = rawLng / 100_000;
    }
  }

  if (lat === undefined || lng === undefined) return null;

  const ville = typeof raw.ville === "string" ? raw.ville : "";
  const cp = typeof raw.cp === "string" ? raw.cp : "";
  const adresse = typeof raw.adresse === "string" ? raw.adresse : "";
  const name =
    [ville, cp].filter(Boolean).join(" · ") || `Point de vente ${id}`;

  const fuels: StationFuel[] = [];
  for (const spec of FUEL_SPECS) {
    const rupture = ruptureActive(raw, spec.ruptKey);
    const rawPrix = raw[spec.prixKey];
    let price: number | null =
      typeof rawPrix === "number" && Number.isFinite(rawPrix) ? rawPrix : null;
    if (rupture) price = null;
    fuels.push({
      fuelId: spec.fuelId,
      shortName: spec.shortName,
      price,
      rupture,
    });
  }

  return {
    id,
    name,
    street: adresse || undefined,
    city: [cp, ville].filter(Boolean).join(" ") || undefined,
    lat,
    lng,
    fuels,
  };
}
