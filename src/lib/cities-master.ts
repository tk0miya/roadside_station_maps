// The municipality table (`data/cities.json`): building it from ABR rows,
// writing it in its canonical form, and describing what changed since last time.
//
// The table is the vocabulary `data/plans.json` writes its addresses in, and the
// order records are sorted by, so it is upstream of the plan master rather than
// beside it. `src/lib/abr.ts` knows the source; this module knows what a row of
// the table is.
//
// Designated cities are carried whole (`浜松市`, not `浜松市天竜区`). 東京都's 23
// wards are not the same thing and stay: they are municipalities in their own
// right, with no city above them, and ABR spells them in the `city` column
// rather than the `ward` one, so the rule below never reaches them.

import * as fs from 'node:fs';
import type { City } from '../frontend/types/plan.js';
import type { AbrCity, AbrPosition } from './abr.js';

// Module-relative so a command works from any directory, as plan-master does.
const CITIES_PATH = new URL('../../data/cities.json', import.meta.url);

export interface CityChange {
    from: City;
    to: City;
}

export interface CityDiff {
    added: City[];
    removed: City[];
    renamed: CityChange[];
}

function label(city: Pick<City, 'pref' | 'city'>): string {
    return `${city.pref} ${city.city}`;
}

// One record per line -- the reason is in docs/cities.md.
export function saveCities(cities: City[]): void {
    const body = cities.map((city) => JSON.stringify(city)).join(',\n');
    fs.writeFileSync(CITIES_PATH, `[\n${body}\n]\n`, 'utf-8');
}

// The registry writes coordinates as text. A value that will not parse means a
// column was read as something it is not, so the run stops rather than writing
// NaN out as `null`.
function parseCoordinate(value: string, name: string, city: string): number {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) {
        throw new Error(`${city} has a ${name} that is not a number: ${value}`);
    }
    return parsed;
}

// The rows that are municipalities today, in 全国地方公共団体コード order.
//
// `today` is passed in rather than read here so the rules can be tested without
// waiting for a merger to happen.
export function buildCities(rows: AbrCity[], positions: AbrPosition[], today: string): City[] {
    const points = new Map(positions.map((position) => [position.lg_code, position]));

    const cities = rows
        // A row with no name is not a municipality, whatever else it may be.
        .filter((row) => row.city !== '')
        // ABR carries a merger or a rename from the day it is decided, with the
        // day it takes effect. Taking those early would break plans.json before
        // the municipality it names ceases to exist.
        .filter((row) => row.efct_date === '' || row.efct_date <= today)
        .filter((row) => row.ablt_date === '' || row.ablt_date > today)
        // Designated cities are represented by themselves, not by their wards.
        .filter((row) => row.ward === '')
        .map((row) => {
            const name = `${row.county}${row.city}`;
            const position = points.get(row.lg_code);
            // Stops rather than skipping: `City.lat` is not nullable, so a row
            // that loses its join would leave a hole in the vocabulary
            // data/plans.json writes its addresses in.
            if (position === undefined) {
                throw new Error(`No representative point joined to ${row.lg_code} (${row.pref} ${name})`);
            }
            return {
                code: row.lg_code,
                pref: row.pref,
                city: name,
                lat: parseCoordinate(position.rep_lat, 'latitude', `${row.pref} ${name}`),
                lng: parseCoordinate(position.rep_lon, 'longitude', `${row.pref} ${name}`),
            };
        });

    // Six digits of fixed width, so string order is code order -- the ordering
    // described on `City.code`.
    return cities.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
}

// What changed, keyed by code where the previous table has one.
//
// A rename is only recognisable by code: 篠山市 and 丹波篠山市 are the same
// 282219, and no amount of string comparison establishes that. The first
// regeneration has no codes to compare against -- the table predates the field
// -- so renames read as an add plus a remove there, which is correct for a
// migration that is being reviewed by hand anyway.
export function diffCities(previous: City[], next: City[]): CityDiff {
    const previousByCode = new Map(previous.filter((city) => city.code).map((city) => [city.code, city]));
    const previousByName = new Set(previous.map(label));
    const nextByName = new Set(next.map(label));

    const renamed: CityChange[] = [];
    for (const city of next) {
        const before = previousByCode.get(city.code);
        if (before !== undefined && (before.city !== city.city || before.pref !== city.pref)) {
            renamed.push({ from: before, to: city });
        }
    }

    const renamedFrom = new Set(renamed.map((change) => label(change.from)));
    const renamedTo = new Set(renamed.map((change) => label(change.to)));

    return {
        added: next.filter((city) => !previousByName.has(label(city)) && !renamedTo.has(label(city))),
        removed: previous.filter((city) => !nextByName.has(label(city)) && !renamedFrom.has(label(city))),
        renamed,
    };
}
