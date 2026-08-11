// Domain types for the roadside-station development-plan map.
//
// This map is independent from the main scraped-station pipeline: its source of
// truth is `data/plans.json`, a hand-edited master tracked in this repository.

// 凍結 sits between 計画中 and 中止: the municipality has declared the plan
// suspended, but not abandoned -- it can still resume.
export type Status = '開業' | '登録済み' | '計画中' | '凍結' | '中止';

export const STATUSES: Status[] = ['開業', '登録済み', '計画中', '凍結', '中止'];

// Where a station's rendered coordinate came from:
//   exact - explicit lat/lng in the master
//   city  - fell back to the municipality (市区町村) representative point
//   none  - could not be resolved (not rendered)
export type CoordSource = 'exact' | 'city' | 'none';

// One source link backing a record's values: `title` is the source page's own
// heading, `url` the page it points at.
export interface PlanUrl {
    title: string;
    url: string;
}

export interface PlannedStation {
    name: string;
    pref: string;
    city: string;
    status: Status;
    date: string;
    lat: number | null;
    lng: number | null;
    urls: PlanUrl[];
    coordSource: CoordSource;
}

// One record of the master file (`data/plans.json`), as written on disk. Its
// key order is fixed and validated by `src/frontend/plan-data.test.ts`. `status` is
// a plain string here and is narrowed at load time (see planned-stations.ts).
export interface PlanRecord {
    name: string;
    pref: string;
    city: string;
    status: string;
    date: string;
    lat: number | null;
    lng: number | null;
    urls: PlanUrl[];
    checked_on: string;
}

// One row of the city (市区町村) representative-point table.
export interface City {
    pref: string;
    city: string;
    lat: number;
    lng: number;
}

// Display category used for marker color and the filter/legend. `status` stays
// 5-valued; 計画中 is split here by whether a target date is set.
export type Category = '開業' | '登録済み' | '計画中(予定あり)' | '計画中(未定)' | '凍結' | '中止';

export const CATEGORIES: Category[] = ['開業', '登録済み', '計画中(予定あり)', '計画中(未定)', '凍結', '中止'];

// Derive a station's display category. 計画中 splits into スケジュールあり / 未定
// by the presence of a date; the other statuses map 1:1.
export function categoryOf(station: PlannedStation): Category {
    if (station.status === '計画中') {
        return station.date ? '計画中(予定あり)' : '計画中(未定)';
    }
    return station.status;
}
