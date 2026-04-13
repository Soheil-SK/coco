"use client";

import type { StationsApiResponse } from "@/lib/stations/types";
import maplibregl, { type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type FuelOption = { id: number; shortName: string; name: string };

type NearbyStation = {
  id: number;
  name: string;
  address: string;
  price: number;
  distKm: number;
  detourLiters: number;
  totalCost: number;
  coords: [number, number];
};

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function circleGeoJson(lat: number, lng: number, radiusKm: number, steps = 64) {
  const coords: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    const dlat = (radiusKm / 111.32) * Math.cos(angle);
    const dlng =
      (radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180))) * Math.sin(angle);
    coords.push([lng + dlng, lat + dlat]);
  }
  return {
    type: "FeatureCollection" as const,
    features: [
      {
        type: "Feature" as const,
        geometry: { type: "Polygon" as const, coordinates: [coords] },
        properties: {},
      },
    ],
  };
}

function computeNearby(
  data: StationsApiResponse,
  pos: { lat: number; lng: number },
  radiusKm: number,
  consumptionL100: number,
  fillL: number,
): { cheapest: NearbyStation | null; mostEco: NearbyStation | null; same: boolean } {
  const stations: NearbyStation[] = [];
  for (const f of data.features) {
    const p = f.properties;
    if (p.price == null) continue;
    const coords = f.geometry.coordinates as [number, number];
    const distKm = haversineKm(pos.lat, pos.lng, coords[1], coords[0]);
    if (distKm > radiusKm) continue;
    const detourLiters = (distKm * consumptionL100) / 100;
    const price = Math.round(p.price * 1000) / 1000; // tronqué au millième pour comparaison
    stations.push({
      id: p.id,
      name: String(p.name),
      address: String(p.address ?? ""),
      price,
      distKm,
      detourLiters,
      totalCost: price * (fillL + detourLiters),
      coords,
    });
  }
  if (stations.length === 0) return { cheapest: null, mostEco: null, same: false };
  const cheapest = [...stations].sort((a, b) => a.price - b.price)[0];
  const mostEco = [...stations].sort((a, b) => a.totalCost - b.totalCost)[0];
  // Même station OU même prix affiché (3 décimales) → un seul gagnant
  const sameStation = cheapest.id === mostEco.id;
  const samePrice = cheapest.price === mostEco.price;
  const same = sameStation || samePrice;
  // Si même prix mais stations différentes, on affiche la plus proche (mostEco)
  const winner = samePrice && !sameStation ? mostEco : cheapest;
  return { cheapest: winner, mostEco, same };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function addBadgeImage(map: maplibregl.Map): void {
  if (map.hasImage("price-badge")) return;
  const W = 32, H = 18;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.roundRect(0.5, 0.5, W - 1, H - 1, 8);
  ctx.fill();
  const raw = ctx.getImageData(0, 0, W, H).data;
  const sdf = new Uint8Array(W * H * 4);
  for (let i = 0; i < raw.length; i += 4) {
    const v = raw[i + 3];
    sdf[i] = v; sdf[i + 1] = v; sdf[i + 2] = v; sdf[i + 3] = v;
  }
  map.addImage("price-badge", { width: W, height: H, data: sdf }, { sdf: true });
}

function applyStationsToMap(map: maplibregl.Map, data: StationsApiResponse) {
  const srcId = "stations";
  const existing = map.getSource(srcId) as GeoJSONSource | undefined;
  if (existing) {
    existing.setData(data);
    return;
  }

  addBadgeImage(map);

  map.addSource(srcId, {
    type: "geojson",
    data,
    cluster: true,
    clusterMaxZoom: 14,
    clusterRadius: 52,
  });

  map.addLayer({
    id: "clusters",
    type: "circle",
    source: srcId,
    filter: ["has", "point_count"],
    paint: {
      "circle-color": "#1c1c1e",
      "circle-radius": ["step", ["get", "point_count"], 12, 10, 16, 50, 20],
      "circle-stroke-width": 1.5,
      "circle-stroke-color": "#ffffff33",
      "circle-opacity": 0.92,
    },
  });

  map.addLayer({
    id: "cluster-count",
    type: "symbol",
    source: srcId,
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["get", "point_count_abbreviated"],
      "text-font": ["Open Sans Bold", "Arial Unicode MS Regular"],
      "text-size": 12,
    },
    paint: { "text-color": "#ffffff" },
  });

  map.addLayer({
    id: "unclustered",
    type: "symbol",
    source: srcId,
    filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "price"], null]],
    layout: {
      "icon-image": "price-badge",
      "icon-text-fit": "both",
      "icon-text-fit-padding": [3, 8, 3, 8],
      "text-field": "OUT",
      "text-size": 11,
      "text-font": ["Open Sans Bold", "Arial Unicode MS Regular"],
      "text-allow-overlap": true,
      "text-ignore-placement": true,
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
    paint: {
      "text-color": "#ffffff",
      "icon-color": "hsl(215 16% 40%)",
      "icon-opacity": 0.85,
    },
  });

  map.addLayer({
    id: "unclustered-price",
    type: "symbol",
    source: srcId,
    filter: ["all", ["!", ["has", "point_count"]], ["!=", ["get", "price"], null]],
    layout: {
      "icon-image": "price-badge",
      "icon-text-fit": "both",
      "icon-text-fit-padding": [3, 8, 3, 8],
      "text-field": [
        "let", "tc", ["round", ["*", ["get", "price"], 100]],
        ["concat",
          ["to-string", ["floor", ["/", ["var", "tc"], 100]]],
          ".",
          ["case",
            ["<", ["%", ["var", "tc"], 100], 10],
            ["concat", "0", ["to-string", ["%", ["var", "tc"], 100]]],
            ["to-string", ["%", ["var", "tc"], 100]]
          ],
          "€"
        ]
      ],
      "text-size": 11,
      "text-font": ["Open Sans Bold", "Arial Unicode MS Regular"],
      "text-allow-overlap": true,
      "text-ignore-placement": true,
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
    paint: {
      "text-color": "#ffffff",
      "icon-color": ["get", "color"],
      "icon-opacity": 0.93,
    },
  });

  map.on("click", "clusters", (e) => {
    void (async () => {
      const feat = map.queryRenderedFeatures(e.point, { layers: ["clusters"] })[0];
      if (!feat?.properties?.cluster_id) return;
      const src = map.getSource(srcId) as GeoJSONSource;
      const clusterId = feat.properties.cluster_id as number;
      const geometry = feat.geometry;
      if (geometry.type !== "Point") return;
      const center = geometry.coordinates as [number, number];
      try {
        const zoom = await src.getClusterExpansionZoom(clusterId);
        map.easeTo({ center, zoom });
      } catch {
        /* ignore */
      }
    })();
  });

  function openStationPopup(map: maplibregl.Map, e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) {
    const f = e.features?.[0];
    if (!f?.geometry || f.geometry.type !== "Point") return;
    const coords = [...f.geometry.coordinates] as [number, number];
    const p = f.properties as Record<string, string | number | null>;
    const name = escapeHtml(String(p.name ?? ""));
    const brand = p.brand ? escapeHtml(String(p.brand)) : "";
    const address = p.address ? escapeHtml(String(p.address)) : "";
    const price =
      p.price != null && p.price !== ""
        ? `${Number(p.price).toFixed(3)} €/L`
        : "Prix indisponible";
    const fuelsLabel = p.fuelsLabel ? escapeHtml(String(p.fuelsLabel)) : "";

    new maplibregl.Popup({ offset: 18 })
      .setLngLat(coords)
      .setHTML(
        `<div class="fuel-popup">
          <div class="fuel-popup-title">${name}</div>
          ${brand ? `<div class="fuel-popup-line">${brand}</div>` : ""}
          ${address ? `<div class="fuel-popup-line">${address}</div>` : ""}
          <div class="fuel-popup-price">${escapeHtml(price)}</div>
          <div class="fuel-popup-fuels">${fuelsLabel}</div>
        </div>`,
      )
      .addTo(map);
  }

  map.on("click", "unclustered", (e) => openStationPopup(map, e));
  map.on("click", "unclustered-price", (e) => openStationPopup(map, e));

  map.on("mouseenter", "clusters", () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", "clusters", () => {
    map.getCanvas().style.cursor = "";
  });
  map.on("mouseenter", "unclustered", () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", "unclustered", () => {
    map.getCanvas().style.cursor = "";
  });
  map.on("mouseenter", "unclustered-price", () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", "unclustered-price", () => {
    map.getCanvas().style.cursor = "";
  });
}

function fitMapToData(map: maplibregl.Map, data: StationsApiResponse) {
  if (data.features.length === 0) return;
  const bounds = new maplibregl.LngLatBounds(
    data.features[0].geometry.coordinates,
    data.features[0].geometry.coordinates,
  );
  for (const f of data.features) {
    bounds.extend(f.geometry.coordinates as [number, number]);
  }
  map.fitBounds(bounds, { padding: 48, maxZoom: 11, duration: 900 });
}

export default function FuelMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const didFitRef = useRef(false);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);

  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [locError, setLocError] = useState<string | null>(null);
  const [radius, setRadius] = useState(5);
  const [consumption, setConsumption] = useState(7);
  const [fillL, setFillL] = useState(1);
  const [stationsData, setStationsData] = useState<StationsApiResponse | null>(null);

  const [mapReady, setMapReady] = useState(false);
  const [fuels, setFuels] = useState<FuelOption[]>([]);
  const [fuelId, setFuelId] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<StationsApiResponse["meta"] | null>(null);

  const loadStations = useCallback(
    async (
      fid: number,
      map: maplibregl.Map,
      opts: { bustCache?: boolean; allowFit?: boolean } = {},
    ) => {
      const bustCache = opts.bustCache ?? false;
      const allowFit = opts.allowFit ?? false;
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({ fuelId: String(fid) });
        if (bustCache) qs.set("refresh", "1");
        const res = await fetch(`/api/stations?${qs.toString()}`);
        const json: unknown = await res.json();
        if (!res.ok) {
          const err =
            typeof json === "object" &&
            json &&
            "error" in json &&
            typeof (json as { error: unknown }).error === "string"
              ? (json as { error: string }).error
              : res.statusText;
          throw new Error(err);
        }
        const data = json as StationsApiResponse;
        setMeta(data.meta);
        setStationsData(data);
        applyStationsToMap(map, data);
        map.resize();
        if (allowFit && data.features.length > 0) {
          fitMapToData(map, data);
          didFitRef.current = true;
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur de chargement");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void fetch("/api/fuels")
      .then((r) => r.json())
      .then((d: unknown) => {
        if (Array.isArray(d)) {
          setFuels(
            d.map((x) => {
              const o = x as FuelOption;
              return { id: o.id, shortName: o.shortName, name: o.name };
            }),
          );
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    const map = new maplibregl.Map({
      container,
      style: {
        version: 8,
        name: "coco-osm",
        glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "© Stadia Maps © OpenStreetMap contributors",
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      },
      center: [2.3522, 46.6034],
      zoom: 5.3,
      maxBounds: [[-6.5, 41.0], [10.5, 51.5]],
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    mapRef.current = map;

    const resize = () => {
      map.resize();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    map.on("load", () => {
      resize();
      requestAnimationFrame(resize);
      setMapReady(true);
    });

    window.addEventListener("orientationchange", resize);

    return () => {
      window.removeEventListener("orientationchange", resize);
      ro.disconnect();
      didFitRef.current = false;
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const allowFit = !didFitRef.current;
    void loadStations(fuelId, mapRef.current, { allowFit });
  }, [fuelId, mapReady, loadStations]);

  // Radius circle on map
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !userPos) return;
    const geoJson = circleGeoJson(userPos.lat, userPos.lng, radius);
    const src = map.getSource("user-radius") as GeoJSONSource | undefined;
    if (src) { src.setData(geoJson); return; }
    map.addSource("user-radius", { type: "geojson", data: geoJson });
    map.addLayer({
      id: "user-radius-fill",
      type: "fill",
      source: "user-radius",
      paint: { "fill-color": "#3b82f6", "fill-opacity": 0.07 },
    });
    map.addLayer({
      id: "user-radius-stroke",
      type: "line",
      source: "user-radius",
      paint: { "line-color": "#3b82f6", "line-width": 1.5, "line-opacity": 0.45 },
    });
  }, [userPos, radius, mapReady]);

  const handleLocate = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setLocError("Géolocalisation non supportée par ce navigateur.");
      return;
    }
    setLocError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setUserPos({ lat, lng });
        const map = mapRef.current;
        if (!map) return;
        if (userMarkerRef.current) {
          userMarkerRef.current.setLngLat([lng, lat]);
        } else {
          const el = document.createElement("div");
          el.style.cssText =
            "width:16px;height:16px;background:#3b82f6;border:3px solid #fff;" +
            "border-radius:50%;box-shadow:0 0 0 6px rgba(59,130,246,0.25);";
          userMarkerRef.current = new maplibregl.Marker({ element: el, anchor: "center" })
            .setLngLat([lng, lat])
            .addTo(map);
        }
        map.flyTo({ center: [lng, lat], zoom: 13, duration: 1200 });
      },
      (err) => setLocError(err.message),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);

  const nearby = useMemo(
    () => (userPos && stationsData ? computeNearby(stationsData, userPos, radius, consumption, fillL) : null),
    [userPos, stationsData, radius, consumption, fillL],
  );

  const refresh = () => {
    if (!mapRef.current) return;
    didFitRef.current = false;
    void loadStations(fuelId, mapRef.current, { bustCache: true, allowFit: true });
  };

  return (
    <div className="fixed inset-0 z-0 bg-slate-900">
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />

      <div className="pointer-events-none absolute left-3 top-3 z-10 flex max-w-[min(100%-1.5rem,22rem)] flex-col gap-2">
        <div className="pointer-events-auto rounded-lg border border-white/10 bg-slate-950/90 p-3 text-slate-100 shadow-lg backdrop-blur">
          <h1 className="text-sm font-semibold tracking-tight text-white">
            Stations-service — prix carburants
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Couleur du point : prix du carburant choisi (vert = moins cher, rouge =
            plus cher, gris = indisponible).
          </p>
          <label className="mt-3 block text-xs font-medium text-slate-300">
            Carburant
            <select
              className="mt-1 w-full rounded border border-white/15 bg-slate-900 px-2 py-1.5 text-sm text-white outline-none focus:border-sky-500"
              value={fuelId}
              onChange={(e) => setFuelId(Number.parseInt(e.target.value, 10))}
            >
              {fuels.length === 0 ? (
                <option value={1}>Chargement…</option>
              ) : (
                fuels.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.shortName} — {f.name}
                  </option>
                ))
              )}
            </select>
          </label>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="rounded bg-sky-600 px-2 py-1 text-xs font-medium text-white hover:bg-sky-500"
              onClick={() => refresh()}
            >
              Rafraîchir données
            </button>
          </div>
          {meta && (
            <dl className="mt-3 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-slate-400">
              <dt>Stations</dt>
              <dd className="text-right text-slate-200">{meta.stationCount}</dd>
              <dt>Avec prix ({meta.fuelShortName})</dt>
              <dd className="text-right text-slate-200">{meta.pricedCount}</dd>
              {meta.minPrice != null && (
                <>
                  <dt>Min / max</dt>
                  <dd className="text-right text-slate-200">
                    {meta.minPrice.toFixed(3)} — {meta.maxPrice?.toFixed(3)} €
                  </dd>
                </>
              )}
            </dl>
          )}
        </div>

        <div className="pointer-events-none rounded border border-white/10 bg-slate-950/80 px-2 py-1 text-[10px] text-slate-400">
          Données :{" "}
          <a
            className="pointer-events-auto text-sky-400 underline"
            href="https://data.economie.gouv.fr/explore/dataset/prix-des-carburants-en-france-flux-instantane-v2"
            target="_blank"
            rel="noreferrer"
          >
            data.economie.gouv.fr (flux instantané)
          </a>
        </div>
      </div>

      {loading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/40 backdrop-blur-[2px]">
          <div className="rounded-lg bg-slate-900 px-4 py-3 text-sm text-white shadow-lg">
            Chargement des stations…
          </div>
        </div>
      )}

      {error && (
        <div className="absolute bottom-4 left-3 right-3 z-20 rounded-lg border border-red-900/50 bg-red-950/90 p-3 text-sm text-red-100 shadow-lg">
          {error}
        </div>
      )}

      {/* Bouton Localiser */}
      {!userPos && (
        <div className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2">
          <button
            type="button"
            onClick={handleLocate}
            className="flex items-center gap-2 rounded-full bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-xl hover:bg-blue-500 active:scale-95 transition-transform"
          >
            <span>📍</span> Localiser
          </button>
          {locError && (
            <p className="mt-2 text-center text-xs text-red-400">{locError}</p>
          )}
        </div>
      )}

      {/* Panel "autour de moi" */}
      {userPos && (
        <div className="absolute bottom-0 left-0 right-0 z-10 border-t border-white/10 bg-slate-950/95 px-4 pt-3 pb-4 backdrop-blur">
          {/* Contrôles */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-300">
            <label className="flex items-center gap-2">
              Rayon
              <input
                type="range" min={1} max={30} step={1} value={radius}
                onChange={(e) => setRadius(Number(e.target.value))}
                className="w-24 accent-blue-500"
              />
              <span className="w-10 text-white">{radius} km</span>
            </label>
            <label className="flex items-center gap-2">
              Conso
              <input
                type="number" min={1} max={30} step={0.5} value={consumption}
                onChange={(e) => setConsumption(Number(e.target.value))}
                className="w-14 rounded border border-white/15 bg-slate-900 px-1 py-0.5 text-white"
              />
              L/100
            </label>
            <label className="flex items-center gap-2">
              Plein
              <input
                type="number" min={1} max={120} step={1} value={fillL}
                onChange={(e) => setFillL(Number(e.target.value))}
                className="w-14 rounded border border-white/15 bg-slate-900 px-1 py-0.5 text-white"
              />
              L
            </label>
            <button
              type="button"
              onClick={() => { setUserPos(null); userMarkerRef.current?.remove(); userMarkerRef.current = null; }}
              className="ml-auto text-slate-500 hover:text-slate-300"
            >
              ✕ Quitter
            </button>
          </div>

          {/* Résultats */}
          {nearby === null || (nearby.cheapest === null && nearby.mostEco === null) ? (
            <p className="mt-2 text-xs text-slate-500">Aucune station avec prix dans ce périmètre.</p>
          ) : nearby.same ? (
            <div className="mt-3">
              <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/50 px-3 py-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                  <span>★</span> Meilleur choix — moins chère ET plus économe
                </div>
                <StationCard s={nearby.cheapest!} fillL={fillL} />
              </div>
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-green-500/30 bg-green-950/40 px-3 py-2">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-green-400">Moins chère</div>
                <StationCard s={nearby.cheapest!} fillL={fillL} />
              </div>
              <div className="rounded-lg border border-blue-500/30 bg-blue-950/40 px-3 py-2">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-blue-400">Moins cher trajet inclus</div>
                <StationCard s={nearby.mostEco!} fillL={fillL} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NavButtons({ coords }: { coords: [number, number] }) {
  const [lng, lat] = coords;
  const links = [
    { href: `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`, src: "/waze.png", alt: "Waze" },
    { href: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, src: "/google.png", alt: "Google Maps" },
    { href: `https://maps.apple.com/?daddr=${lat},${lng}`, src: "/apple.png", alt: "Plan" },
  ];
  return (
    <div className="mt-2 flex gap-2">
      {links.map(({ href, src, alt }) => (
        <a
          key={alt}
          href={href}
          target="_blank"
          rel="noreferrer"
          title={alt}
          className="flex-1 flex items-center justify-center rounded-lg border border-white/10 bg-white/5 p-1.5 hover:bg-white/10 transition-colors"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} width={28} height={28} className="rounded" />
        </a>
      ))}
    </div>
  );
}

function StationCard({ s, fillL }: { s: NearbyStation; fillL: number }) {
  const detourCost = s.detourLiters * s.price;
  const totalFill = s.price * fillL;
  return (
    <div className="text-xs text-slate-200 space-y-1 mt-1">
      {/* Nom + adresse */}
      <div className="font-medium text-white truncate">{s.name}</div>
      {s.address && <div className="text-slate-400 truncate">{s.address}</div>}

      {/* KM + coût trajet — gros, centré */}
      <div className="text-center py-1">
        <div className="text-2xl font-bold text-white leading-none">
          {s.distKm.toFixed(1)} km
          <span className="text-base font-normal text-slate-400 ml-2">({detourCost.toFixed(2)} €)</span>
        </div>
        <div className="text-[10px] text-slate-500 mt-0.5">depuis ma position · coût en essence</div>
      </div>

      {/* Prix/L — centré */}
      <div className="text-center text-sm font-semibold text-slate-200">
        {s.price.toFixed(3)} €/L
      </div>

      {/* Prix du plein — gros, centré */}
      <div className="text-center py-1">
        <div className="text-2xl font-bold text-white leading-none">{(totalFill + detourCost).toFixed(2)} €</div>
        <div className="text-[10px] text-slate-500 mt-0.5">plein ({fillL} L) + trajet</div>
      </div>

      <NavButtons coords={s.coords} />
    </div>
  );
}
