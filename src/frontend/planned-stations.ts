// Client for the planned-stations data source.
//
// The source is the human-managed Google Spreadsheet published as CSV. It is
// modeled here as a read-only "CSV API" client so its interface matches the
// other storage/ clients (a class exposing `list()`), even though it is
// unauthenticated and hits an external CSV endpoint rather than our backend.
// The pure parse step is exported separately so it can be unit-tested.

import Papa from 'papaparse';
import { sortPlannedStations } from './plan-order';
import type { City, PlannedStation, Status } from './types/plan';
import { STATUSES } from './types/plan';

// Published Google Spreadsheet CSV (File → Share → Publish to web → CSV).
// Editing the sheet is reflected on the next page reload.
const CSV_URL =
    'https://docs.google.com/spreadsheets/d/e/2PACX-1vT2qrp8OEprW-P4t75_L1uz0tqvwlv0pCn_nq6zGfMaWJ1HoDcozmCdw5TRvgjNTMScdkg_tgY0WbRW/pub?output=csv';

// City (市区町村) representative points, relative to html/plan.html.
const CITIES_URL = '../data/cities.json';

function cityKey(pref: string, city: string): string {
    return `${pref} ${city}`;
}

function toStatus(value: string): Status {
    return (STATUSES as string[]).includes(value) ? (value as Status) : '計画中';
}

function toNumber(value: string): number | null {
    const t = value.trim();
    if (t === '') {
        return null;
    }
    const n = Number(t);
    return Number.isNaN(n) ? null : n;
}

function toStation(record: Record<string, string>, cityIndex: Map<string, City>): PlannedStation {
    const pref = (record.pref ?? '').trim();
    const city = (record.city ?? '').trim();

    let lat = toNumber(record.lat ?? '');
    let lng = toNumber(record.lng ?? '');
    let coordSource: PlannedStation['coordSource'] = 'none';

    if (lat !== null && lng !== null) {
        coordSource = 'exact';
    } else {
        const match = pref && city ? cityIndex.get(cityKey(pref, city)) : undefined;
        if (match) {
            lat = match.lat;
            lng = match.lng;
            coordSource = 'city';
        }
    }

    return {
        name: (record.name ?? '').trim(),
        pref,
        city,
        status: toStatus((record.status ?? '').trim()),
        date: (record.date ?? '').trim(),
        lat,
        lng,
        memo: record.memo ?? '',
        coordSource,
    };
}

// Pure transform: CSV text + city table → PlannedStation[], in display order
// (see plan-order.ts; the city table doubles as the prefecture ordering). Kept
// separate from the network call so it can be unit-tested. papaparse handles
// quoted fields with embedded newlines/commas (the memo column often holds
// several URLs).
export function parsePlannedStations(csvText: string, cities: City[]): PlannedStation[] {
    const cityIndex = new Map<string, City>();
    for (const c of cities) {
        cityIndex.set(cityKey(c.pref, c.city), c);
    }

    const parsed = Papa.parse<Record<string, string>>(csvText, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim(),
    });

    const stations = parsed.data.map((record) => toStation(record, cityIndex)).filter((s) => s.name !== '');
    return sortPlannedStations(stations, cities);
}

// Google returns an HTML error page (not CSV) when the sheet is unpublished or
// unavailable, so a non-OK status must be rejected here; otherwise it would be
// parsed as an empty CSV and shown as a station-less map.
async function fetchOk(url: string): Promise<Response> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status}`);
    }
    return response;
}

export class PlannedStationsApiClient {
    async list(): Promise<PlannedStation[]> {
        const [csvText, cities] = await Promise.all([
            fetchOk(CSV_URL).then((r) => r.text()),
            fetchOk(CITIES_URL).then((r) => r.json()) as Promise<City[]>,
        ]);
        return parsePlannedStations(csvText, cities);
    }
}
