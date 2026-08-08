// Domain types for the roadside-station development-plan map.
//
// This map is independent from the main scraped-station pipeline: its source of
// truth is a human-managed Google Spreadsheet (published as CSV).

import type { PlanEntry } from '#shared/plan-types';

// Where a station's rendered coordinate came from:
//   exact - explicit lat/lng in the sheet
//   city  - fell back to the municipality (市区町村) representative point
//   none  - could not be resolved (not rendered)
export type CoordSource = 'exact' | 'city' | 'none';

// A sheet row plus the coordinate resolution the map performed on load.
export interface PlannedStation extends PlanEntry {
    coordSource: CoordSource;
}

// One row of the city (市区町村) representative-point table.
export interface City {
    pref: string;
    city: string;
    lat: number;
    lng: number;
}

// Display category used for marker color and the filter/legend. The sheet's
// `status` stays 4-valued; 計画中 is split here by whether a target date is set.
export type Category = '開業' | '登録済み' | '計画中(予定あり)' | '計画中(未定)' | '中止';

export const CATEGORIES: Category[] = ['開業', '登録済み', '計画中(予定あり)', '計画中(未定)', '中止'];

// Derive a station's display category. 計画中 splits into スケジュールあり / 未定
// by the presence of a date; the other statuses map 1:1.
export function categoryOf(station: PlannedStation): Category {
    if (station.status === '計画中') {
        return station.date ? '計画中(予定あり)' : '計画中(未定)';
    }
    return station.status;
}
