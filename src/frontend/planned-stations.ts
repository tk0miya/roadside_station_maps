// Loader for the development-plan data.
//
// The master is `data/plans.json`, tracked in this repository and served as-is
// by GitHub Pages (deploy.yml copies `data/` verbatim), so loading is a plain
// fetch of two static files. The pure transform is exported separately so it
// can be unit-tested without the network.

import { sortPlannedStations } from './plan-order';
import type { City, PlannedStation, PlanRecord, Status } from './types/plan';
import { STATUSES } from './types/plan';

// Both paths are relative to html/plan.html.
const PLANS_URL = '../data/plans.json';
const CITIES_URL = '../data/cities.json';

function cityKey(pref: string, city: string): string {
    return `${pref} ${city}`;
}

// `npm run ci` rejects an unknown status, so this only ever fires on a copy of
// the file older than that check -- a stale deployment, or a browser cache. It
// is worth the one line: an unexpected value would otherwise leave the station
// out of every category, dropping it from the sidebar and the map at once.
function toStatus(value: string): Status {
    return (STATUSES as string[]).includes(value) ? (value as Status) : '計画中';
}

function toStation(record: PlanRecord, cityIndex: Map<string, City>): PlannedStation {
    let { lat, lng } = record;
    let coordSource: PlannedStation['coordSource'] = 'none';

    if (lat !== null && lng !== null) {
        coordSource = 'exact';
    } else {
        const match = record.pref && record.city ? cityIndex.get(cityKey(record.pref, record.city)) : undefined;
        if (match) {
            lat = match.lat;
            lng = match.lng;
            coordSource = 'city';
        }
    }

    return {
        name: record.name,
        pref: record.pref,
        city: record.city,
        status: toStatus(record.status),
        date: record.date,
        lat,
        lng,
        urls: record.urls,
        coordSource,
    };
}

// Pure transform: master records + city table → PlannedStation[], in display
// order (see plan-order.ts; the city table doubles as the prefecture ordering).
export function toPlannedStations(records: PlanRecord[], cities: City[]): PlannedStation[] {
    const cityIndex = new Map<string, City>();
    for (const c of cities) {
        cityIndex.set(cityKey(c.pref, c.city), c);
    }

    const stations = records.map((record) => toStation(record, cityIndex)).filter((s) => s.name !== '');
    return sortPlannedStations(stations, cities);
}

// A missing or misdeployed file returns an HTML error page, which would not
// parse as the expected array; reject on a non-OK status so the map reports the
// failure instead of rendering as station-less.
async function fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status}`);
    }
    return response.json() as Promise<T>;
}

export async function loadPlannedStations(): Promise<PlannedStation[]> {
    const [records, cities] = await Promise.all([fetchJson<PlanRecord[]>(PLANS_URL), fetchJson<City[]>(CITIES_URL)]);
    return toPlannedStations(records, cities);
}
