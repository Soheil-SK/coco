export type FuelInfo = {
  id: number;
  name: string;
  shortName: string;
  type: string;
  picto: string;
};

export type StationFuel = {
  fuelId: number;
  shortName: string;
  price: number | null;
  rupture: boolean;
};

export type NormalizedStation = {
  id: number;
  name: string;
  type?: string;
  brandName?: string;
  street?: string;
  city?: string;
  lat: number;
  lng: number;
  fuels: StationFuel[];
};

export type StationPointProps = {
  id: number;
  name: string;
  brand?: string;
  address?: string;
  /** Prix TTC €/L pour le carburant sélectionné (si disponible) */
  price: number | null;
  /** Couleur hex pour MapLibre */
  color: string;
  fuelsLabel: string;
};

export type StationFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: StationPointProps;
};

export type StationsGeoJson = {
  type: "FeatureCollection";
  features: StationFeature[];
};

export type StationsApiResponse = {
  type: "FeatureCollection";
  features: StationFeature[];
  meta: {
    fuelId: number;
    fuelShortName: string;
    minPrice: number | null;
    maxPrice: number | null;
    stationCount: number;
    pricedCount: number;
    cachedAt: number;
  };
};
