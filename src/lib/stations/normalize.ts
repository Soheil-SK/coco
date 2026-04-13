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

function readLatLng(obj: Record<string, unknown>): { lat: number; lng: number } | null {
  const latKeys = ["latitude", "lat", "Latitude", "LAT"];
  const lngKeys = ["longitude", "lng", "lon", "Longitude", "LNG"];
  let lat: number | undefined;
  let lng: number | undefined;
  for (const k of latKeys) {
    lat = readNumber(obj[k]);
    if (lat !== undefined) break;
  }
  for (const k of lngKeys) {
    lng = readNumber(obj[k]);
    if (lng !== undefined) break;
  }
  if (lat === undefined || lng === undefined) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function nestedLatLng(address: unknown): { lat: number; lng: number } | null {
  if (!isRecord(address)) return null;
  return readLatLng(address);
}

function parseFuels(raw: unknown): StationFuel[] {
  if (!Array.isArray(raw)) return [];
  const out: StationFuel[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const id = readNumber(item.id ?? item.fuel);
    if (id === undefined) continue;
    const rupture = Boolean(item.rupture);
    const priceObj = item.Price;
    let price: number | null = null;
    if (isRecord(priceObj)) {
      const v = readNumber(priceObj.value);
      if (v !== undefined) price = v;
    }
    const shortName =
      typeof item.short_name === "string"
        ? item.short_name
        : typeof item.shortName === "string"
          ? item.shortName
          : String(id);
    out.push({ fuelId: id, shortName, price, rupture });
  }
  return out;
}

/** Extrait une station exploitable pour la carte depuis la réponse JSON 2aaz. */
export function normalizeStation(raw: unknown): NormalizedStation | null {
  if (!isRecord(raw)) return null;
  const id = readNumber(raw.id);
  if (id === undefined) return null;

  const name = typeof raw.name === "string" ? raw.name : `Station ${id}`;
  const type = typeof raw.type === "string" ? raw.type : undefined;

  let brandName: string | undefined;
  const brand = raw.Brand;
  if (isRecord(brand)) {
    if (typeof brand.name === "string") brandName = brand.name;
    else if (typeof brand.short_name === "string") brandName = brand.short_name;
    else if (typeof brand.shortName === "string") brandName = brand.shortName;
  }

  let street: string | undefined;
  let city: string | undefined;
  const address = raw.Address;
  if (isRecord(address)) {
    if (typeof address.street_line === "string") street = address.street_line;
    if (typeof address.city_line === "string") city = address.city_line;
  }

  const coords =
    readLatLng(raw) ??
    nestedLatLng(raw.Address) ??
    nestedLatLng(raw.address) ??
    nestedLatLng(raw.position);

  if (!coords) return null;

  const fuels = parseFuels(raw.Fuels ?? raw.fuels);

  return {
    id,
    name,
    type,
    brandName,
    street,
    city,
    lat: coords.lat,
    lng: coords.lng,
    fuels,
  };
}
