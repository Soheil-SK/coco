import { getFuelById } from "@/lib/fuels/catalog";
import { buildStationsGeoJson } from "@/lib/stations/build-geojson";
import {
  clearStationCache,
  readStationCache,
  writeStationCache,
} from "@/lib/stations/station-cache";
import {
  assertTwoAazConfigured,
  createStationSource,
  getStationSourceKind,
} from "@/lib/stations/station-source";
import type { StationsApiResponse } from "@/lib/stations/types";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const fuelIdParam = req.nextUrl.searchParams.get("fuelId");
  const fuelId = fuelIdParam ? Number.parseInt(fuelIdParam, 10) : 1;
  if (!Number.isFinite(fuelId) || fuelId < 1) {
    return NextResponse.json({ error: "fuelId invalide" }, { status: 400 });
  }

  const bust = req.nextUrl.searchParams.get("refresh") === "1";
  if (bust) clearStationCache();

  try {
    if (getStationSourceKind() === "twoaaz") {
      assertTwoAazConfigured();
    }

    const kind = getStationSourceKind();
    let stations = readStationCache(kind);
    if (!stations) {
      const source = createStationSource();
      stations = await source.fetchAllStations();
      writeStationCache(kind, stations);
    }

    const fuel = getFuelById(fuelId) ?? getFuelById(1);
    const fuelShortName = fuel?.shortName ?? String(fuelId);

    const body: StationsApiResponse = buildStationsGeoJson(
      stations,
      fuelId,
      fuelShortName,
    );

    return NextResponse.json(body);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue";
    const status = message.includes("401") ? 401 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
