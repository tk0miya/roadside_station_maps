// Domain types for the roadside-station development-plan map. What the columns
// and the display categories mean is in `docs/plan-map.md`.

export type Status = '開業' | '登録済み' | '計画中' | '凍結' | '中止';

export const STATUSES: Status[] = ['開業', '登録済み', '計画中', '凍結', '中止'];

// What the plan builds: a new station, or a relocation or rebuild of one that
// already exists.
export type Kind = '新設' | '移転' | '再整備';

export const KINDS: Kind[] = ['新設', '移転', '再整備'];

// Where a station's coordinate came from: the record's own lat/lng, the
// municipality representative point it fell back to, or neither.
export type CoordSource = 'exact' | 'city' | 'none';

export interface PlanUrl {
    title: string;
    url: string;
}

export interface PlannedStation {
    name: string;
    pref: string;
    city: string;
    kind: Kind;
    status: Status;
    date: string;
    lat: number | null;
    lng: number | null;
    urls: PlanUrl[];
    coordSource: CoordSource;
}

// One record of the master file (`data/plans.json`), as written on disk. Its
// key order is fixed and validated by `src/frontend/plan-data.test.ts`. `kind` and
// `status` are plain strings here and are narrowed at load time (see
// planned-stations.ts).
export interface PlanRecord {
    name: string;
    pref: string;
    city: string;
    kind: string;
    status: string;
    date: string;
    lat: number | null;
    lng: number | null;
    urls: PlanUrl[];
    checked_on: string;
}

// One row of the city (市区町村) representative-point table.
//
// `code` is the 全国地方公共団体コード, six digits as a string so the leading zero
// survives. The table is sorted by it, and it identifies a municipality across
// regenerations -- the code outlives the name (篠山市 and 丹波篠山市 are both
// 282219).
export interface City {
    code: string;
    pref: string;
    city: string;
    lat: number;
    lng: number;
}

// Display category, derived from `status` and `date`, and used for marker color,
// the sidebar grouping and the filter.
export type Category = '開業' | '登録済み' | '計画中(予定あり)' | '計画中(未定)' | '凍結' | '中止';

export const CATEGORIES: Category[] = ['開業', '登録済み', '計画中(予定あり)', '計画中(未定)', '凍結', '中止'];

export function categoryOf(station: PlannedStation): Category {
    if (station.status === '計画中') {
        return station.date ? '計画中(予定あり)' : '計画中(未定)';
    }
    return station.status;
}

// The name with the kind appended for a relocation or rebuild: 道の駅 よいち (移転).
export function displayName(station: PlannedStation): string {
    return station.kind === '新設' ? station.name : `${station.name} (${station.kind})`;
}
