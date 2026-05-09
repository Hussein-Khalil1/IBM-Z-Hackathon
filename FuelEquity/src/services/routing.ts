// Routing service — Nominatim geocoding + OSRM multi-route directions + fuel costing

const OSRM = 'https://router.project-osrm.org';
const NOMINATIM = 'https://nominatim.openstreetmap.org';
const GAS_CAD_L = 1.55;         // Ontario avg, CAD per litre
const TOLL_407_CAD_KM = 0.28;   // 407 ETR est. CAD per km

type Coord = { latitude: number; longitude: number };

export interface GeocodedPlace {
  name: string;
  coordinate: Coord;
}

export interface RouteStep {
  instruction: string;
  streetName: string;
  distanceM: number;
  durationS: number;
  maneuverType: string;
  maneuverModifier?: string;
  coordinate: Coord;
}

export interface RouteOption {
  id: string;
  label: string;
  coords: Coord[];
  distanceM: number;
  durationS: number;
  isTollRoute: boolean;
  tollCostCAD: number;
  fuelL100km: number;
  fuelLiters: number;
  fuelCostCAD: number;
  totalCostCAD: number;
  isRecommended: boolean;
  steps: RouteStep[];
}

// ─── Polyline decoder (Google/OSRM precision-5 format) ────────────────────────

function decodePoly(encoded: string): Coord[] {
  const out: Coord[] = [];
  let i = 0, lat = 0, lng = 0;
  while (i < encoded.length) {
    let b: number, shift = 0, acc = 0;
    do { b = encoded.charCodeAt(i++) - 63; acc |= (b & 31) << shift; shift += 5; } while (b >= 32);
    lat += acc & 1 ? ~(acc >> 1) : acc >> 1;
    shift = 0; acc = 0;
    do { b = encoded.charCodeAt(i++) - 63; acc |= (b & 31) << shift; shift += 5; } while (b >= 32);
    lng += acc & 1 ? ~(acc >> 1) : acc >> 1;
    out.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return out;
}

// ─── Step instruction builder ─────────────────────────────────────────────────

function buildInstruction(type: string, modifier?: string, name?: string): string {
  const onto = name ? ` onto ${name}` : '';
  if (type === 'depart') return name ? `Head along ${name}` : 'Depart';
  if (type === 'arrive') return 'Arrive at destination';
  if (type === 'continue' || type === 'notification') return name ? `Continue on ${name}` : 'Continue straight';
  if (type === 'turn') {
    if (modifier === 'left' || modifier === 'sharp left') return `Turn left${onto}`;
    if (modifier === 'right' || modifier === 'sharp right') return `Turn right${onto}`;
    if (modifier === 'slight left') return `Bear left${onto}`;
    if (modifier === 'slight right') return `Bear right${onto}`;
    if (modifier === 'uturn') return `Make a U-turn${name ? ` on ${name}` : ''}`;
    return `Continue${onto}`;
  }
  if (type === 'merge') return `Merge${onto}`;
  if (type === 'on ramp' || type === 'ramp') return modifier?.includes('left') ? `Take the left ramp${onto}` : `Take the right ramp${onto}`;
  if (type === 'off ramp') return `Take the exit${onto}`;
  if (type === 'fork') return modifier?.includes('left') ? `Keep left${onto}` : `Keep right${onto}`;
  if (type === 'end of road') return modifier === 'left' ? 'Turn left at the end of the road' : 'Turn right at the end of the road';
  if (type === 'roundabout' || type === 'rotary') return `At the roundabout, take the exit${onto}`;
  if (type === 'exit roundabout' || type === 'exit rotary') return `Exit the roundabout${onto}`;
  if (type === 'use lane') return 'Use the appropriate lane';
  return name ? `Continue on ${name}` : 'Continue straight';
}

// ─── Autocomplete (Photon — no API key, built for real-time suggestions) ──────

interface PhotonProps {
  name?: string;
  street?: string;
  housenumber?: string;
  city?: string;
  state?: string;
  country?: string;
}

function formatPhoton(p: PhotonProps): string {
  const parts: string[] = [];
  if (p.housenumber && p.street) {
    parts.push(`${p.housenumber} ${p.street}`);
  } else if (p.name && p.name !== p.city) {
    parts.push(p.name);
  }
  if (p.city) parts.push(p.city);
  if (p.state) parts.push(p.state);
  return parts.filter(Boolean).join(', ');
}

export async function suggestPlace(query: string): Promise<GeocodedPlace[]> {
  if (query.trim().length < 2) return [];
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5&lang=en`;
    const res = await fetch(url, { signal: ctrl.signal });
    const data = await res.json() as {
      features: Array<{
        geometry: { coordinates: [number, number] };
        properties: PhotonProps;
      }>;
    };
    return (data.features ?? [])
      .map(f => ({
        name: formatPhoton(f.properties),
        coordinate: {
          latitude: f.geometry.coordinates[1],
          longitude: f.geometry.coordinates[0],
        },
      }))
      .filter(p => p.name.length > 0);
  } catch { return []; }
  finally { clearTimeout(t); }
}

// ─── Geocoding ────────────────────────────────────────────────────────────────

export async function geocodeAddress(query: string): Promise<GeocodedPlace | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const url = `${NOMINATIM}/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'FuelEquity/1.0 (husseinhkk@hotmail.com)' },
    });
    const data = (await res.json()) as Array<{ display_name: string; lat: string; lon: string }>;
    if (!data[0]) return null;
    return {
      name: data[0].display_name.split(',').slice(0, 2).join(',').trim(),
      coordinate: { latitude: parseFloat(data[0].lat), longitude: parseFloat(data[0].lon) },
    };
  } catch { return null; }
  finally { clearTimeout(t); }
}

export async function reverseGeocode(coord: Coord): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const url = `${NOMINATIM}/reverse?lat=${coord.latitude}&lon=${coord.longitude}&format=json`;
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'FuelEquity/1.0 (husseinhkk@hotmail.com)' },
    });
    const data = await res.json() as { display_name?: string; address?: { road?: string; suburb?: string; city?: string } };
    const a = data.address;
    if (a?.road) return [a.road, a.suburb ?? a.city].filter(Boolean).join(', ');
    return data.display_name?.split(',').slice(0, 2).join(',').trim() ?? 'Current Location';
  } catch { return 'Current Location'; }
  finally { clearTimeout(t); }
}

// ─── OSRM routing ─────────────────────────────────────────────────────────────

interface OsrmStep {
  distance: number;
  duration: number;
  name: string;
  maneuver: { type: string; modifier?: string; location: [number, number] };
}
interface OsrmLeg { steps: OsrmStep[] }
interface OsrmRoute { geometry: string; distance: number; duration: number; legs: OsrmLeg[] }

async function osrmFetch(coordStr: string, alternatives: boolean): Promise<OsrmRoute[]> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 14000);
  try {
    const alt = alternatives ? 'alternatives=3&' : '';
    const url = `${OSRM}/route/v1/driving/${coordStr}?${alt}geometries=polyline&overview=full&steps=true`;
    const res = await fetch(url, { signal: ctrl.signal });
    const data = await res.json() as { code: string; routes?: OsrmRoute[] };
    if (data.code !== 'Ok') return [];
    return data.routes ?? [];
  } catch { return []; }
  finally { clearTimeout(t); }
}

function ll(c: Coord) { return `${c.longitude},${c.latitude}`; }

// ─── Fuel & cost calculation ──────────────────────────────────────────────────

function speedToL100(kmh: number, isToll: boolean): number {
  if (isToll || kmh > 90) return 7.2;  // express highway
  if (kmh > 75) return 8.1;            // highway
  if (kmh > 55) return 9.8;            // mixed
  return 12.6;                          // city/stop-and-go
}

function buildOption(
  raw: OsrmRoute,
  id: string,
  label: string,
  isToll: boolean,
): RouteOption {
  const distKm = raw.distance / 1000;
  const durH = Math.max(raw.duration / 3600, 0.001);
  const fuelL100 = speedToL100(distKm / durH, isToll);
  const fuelLiters = (distKm * fuelL100) / 100;
  const fuelCostCAD = fuelLiters * GAS_CAD_L;
  const tollCostCAD = isToll ? distKm * 0.65 * TOLL_407_CAD_KM : 0;
  const steps: RouteStep[] = (raw.legs ?? []).flatMap(leg =>
    (leg.steps ?? []).map(s => ({
      instruction: buildInstruction(s.maneuver.type, s.maneuver.modifier, s.name),
      streetName: s.name,
      distanceM: s.distance,
      durationS: s.duration,
      maneuverType: s.maneuver.type,
      maneuverModifier: s.maneuver.modifier,
      coordinate: { latitude: s.maneuver.location[1], longitude: s.maneuver.location[0] },
    })),
  );
  return {
    id,
    label,
    coords: decodePoly(raw.geometry),
    distanceM: raw.distance,
    durationS: raw.duration,
    isTollRoute: isToll,
    tollCostCAD,
    fuelL100km: fuelL100,
    fuelLiters,
    fuelCostCAD,
    totalCostCAD: fuelCostCAD + tollCostCAD,
    isRecommended: false,
    steps,
  };
}

function inGTA(c: Coord) {
  return c.latitude > 43.3 && c.latitude < 44.2 && c.longitude > -80.3 && c.longitude < -78.4;
}

const ALT_LABELS = ['Fastest Route', 'Alternative Route', 'Local Streets'];

// ─── Public API ───────────────────────────────────────────────────────────────

export async function fetchRoutes(origin: Coord, destination: Coord): Promise<RouteOption[]> {
  const collected: RouteOption[] = [];

  // 1. Free-road alternatives (OSRM)
  const alts = await osrmFetch(`${ll(origin)};${ll(destination)}`, true);
  alts.slice(0, 3).forEach((raw, i) =>
    collected.push(buildOption(raw, `alt_${i}`, ALT_LABELS[i] ?? `Route ${i + 1}`, false)),
  );

  // 2. 407 ETR option via a northern waypoint (GTA only)
  if (inGTA(origin) && inGTA(destination)) {
    const via: Coord = {
      latitude: 43.81,
      longitude: (origin.longitude + destination.longitude) / 2,
    };
    const raw407 = await osrmFetch(`${ll(origin)};${ll(via)};${ll(destination)}`, false);
    if (raw407[0]?.geometry) {
      // Prepend so the toll route is visible alongside the free alternatives
      collected.unshift(buildOption(raw407[0], 'toll_407', 'Via 407 ETR', true));
    }
  }

  if (!collected.length) return [];

  // Mark lowest total-cost route as recommended
  const bestIdx = collected.reduce(
    (b, r, i) => (r.totalCostCAD < collected[b].totalCostCAD ? i : b),
    0,
  );
  collected[bestIdx] = { ...collected[bestIdx], isRecommended: true };

  return collected;
}
