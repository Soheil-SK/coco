import type {
  NormalizedStation,
  StationFeature,
  StationsApiResponse,
} from "./types";

function clamp01(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t;
}

/** Vert (120°) → rouge (0°) en HSL. */
export function priceToColor(t: number): string {
  const hue = 120 * (1 - clamp01(t));
  return `hsl(${hue} 78% 40%)`;
}

export const NO_PRICE_COLOR = "hsl(215 16% 47%)";

export function buildStationsGeoJson(
  stations: NormalizedStation[],
  fuelId: number,
  fuelShortName: string,
): StationsApiResponse {
  const prices: number[] = [];
  for (const s of stations) {
    const f = s.fuels.find((x) => x.fuelId === fuelId);
    if (f?.price != null && !f.rupture) prices.push(f.price);
  }
  const minPrice = prices.length ? Math.min(...prices) : null;
  const maxPrice = prices.length ? Math.max(...prices) : null;
  const span =
    minPrice != null && maxPrice != null && maxPrice > minPrice
      ? maxPrice - minPrice
      : minPrice != null && maxPrice != null && maxPrice === minPrice
        ? 1
        : 0;

  const features: StationFeature[] = [];
  let pricedCount = 0;

  for (const s of stations) {
    const f = s.fuels.find((x) => x.fuelId === fuelId);
    const price =
      f && !f.rupture && f.price != null && Number.isFinite(f.price) ? f.price : null;

    let color = NO_PRICE_COLOR;
    if (price != null && minPrice != null && maxPrice != null) {
      pricedCount += 1;
      const t = span > 0 ? (price - minPrice) / span : 0.5;
      color = priceToColor(t);
    }

    const address = [s.street, s.city].filter(Boolean).join(" — ") || undefined;
    const fuelsLabel = s.fuels
      .map((x) =>
        x.price != null && !x.rupture ? `${x.shortName}: ${x.price.toFixed(3)} €` : null,
      )
      .filter(Boolean)
      .join(" · ");

    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [s.lng, s.lat] },
      properties: {
        id: s.id,
        name: s.name,
        brand: s.brandName,
        address,
        price,
        color,
        fuelsLabel: fuelsLabel || "Prix non disponibles",
      },
    });
  }

  return {
    type: "FeatureCollection",
    features,
    meta: {
      fuelId,
      fuelShortName,
      minPrice,
      maxPrice,
      stationCount: stations.length,
      pricedCount,
      cachedAt: Date.now(),
    },
  };
}
