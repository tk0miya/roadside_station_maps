// Record order of the development-plan master (`data/plans.json`) as written on
// disk: prefecture, then city, then name, with prefecture and city ranked by
// their first appearance in `data/cities.json` (全国地方公共団体コード順).
//
// Distinct from `src/frontend/plan-order.ts`, which decides *display* order
// after loading. This one is about the order of records in the file, and lives
// here because two places have to agree on it: the check that rejects a
// misplaced record (`src/frontend/plan-data.test.ts`) and the writer that has
// to put a new one in the right place (`src/scripts/plan.ts`). Stating it
// twice would let one of them drift.
//
// The parameters are structural on purpose -- the full `City` and `PlanRecord`
// satisfy them -- so ordering the master does not depend on the frontend types.

// A row of the city table, read only for the order it appears in.
export interface CityOrderRow {
    pref: string;
    city: string;
}

// The three fields a record's position depends on.
export interface PlanRecordOrderKey {
    pref: string;
    city: string;
    name: string;
}

// Cities and prefectures the table does not know sort last.
const LAST = Number.MAX_SAFE_INTEGER;

function compare(a: string, b: string): number {
    if (a < b) {
        return -1;
    }
    return a > b ? 1 : 0;
}

function cityKey(record: PlanRecordOrderKey): string {
    return `${record.pref} ${record.city}`;
}

export function createPlanRecordComparator(
    cities: CityOrderRow[]
): (a: PlanRecordOrderKey, b: PlanRecordOrderKey) => number {
    const prefOrder = new Map<string, number>();
    const cityOrder = new Map<string, number>();
    for (const city of cities) {
        if (!prefOrder.has(city.pref)) {
            prefOrder.set(city.pref, prefOrder.size);
        }
        const key = `${city.pref} ${city.city}`;
        if (!cityOrder.has(key)) {
            cityOrder.set(key, cityOrder.size);
        }
    }

    return (a, b) => {
        const prefs = [prefOrder.get(a.pref) ?? LAST, prefOrder.get(b.pref) ?? LAST];
        if (prefs[0] !== prefs[1]) {
            return prefs[0] - prefs[1];
        }
        const keys = [cityOrder.get(cityKey(a)) ?? LAST, cityOrder.get(cityKey(b)) ?? LAST];
        if (keys[0] !== keys[1]) {
            return keys[0] - keys[1];
        }
        // Cities missing from the table share the LAST rank, so they fall back
        // to string order within their prefecture.
        if (keys[0] === LAST && a.city !== b.city) {
            return compare(a.city, b.city);
        }
        return compare(a.name, b.name);
    };
}

// The prefectures the table knows, in order. `plan.ts` uses it to reject a
// prefecture the master could not hold, before writing rather than in CI.
export function knownPrefectures(cities: CityOrderRow[]): string[] {
    const seen: string[] = [];
    for (const city of cities) {
        if (!seen.includes(city.pref)) {
            seen.push(city.pref);
        }
    }
    return seen;
}
