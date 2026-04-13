import type { FuelInfo } from "@/lib/stations/types";

/** Identifiants alignés sur l’opendata « prix carburants » (1–6), utilisés par gouv et l’ancienne API 2aaz. */
export const OFFICIAL_FUELS: FuelInfo[] = [
  { id: 1, name: "Gazole", shortName: "Gazole", type: "D", picto: "B7" },
  { id: 2, name: "Super Sans Plomb 95", shortName: "SP95", type: "E", picto: "E5" },
  { id: 3, name: "Super Ethanol E85", shortName: "E85", type: "E", picto: "E85" },
  { id: 4, name: "GPLc", shortName: "GPLc", type: "G", picto: "LPG" },
  { id: 5, name: "Super Sans Plomb 95 E10", shortName: "SP95-E10", type: "E", picto: "E10" },
  { id: 6, name: "Super Sans Plomb 98", shortName: "SP98", type: "E", picto: "E5" },
];

export function getFuelById(id: number): FuelInfo | undefined {
  return OFFICIAL_FUELS.find((f) => f.id === id);
}
