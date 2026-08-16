// Display order for the development-plan station list. The ordering rules are in
// `docs/plan-map.md`; this file turns them into comparable keys.

import type { Category, City, PlannedStation } from './types/plan';
import { CATEGORIES, categoryOf } from './types/plan';

// Granularity ranks, ordered from the narrowest notation to the widest.
const DAY = 0;
const MONTH = 1;
const QUARTER = 2; // a season, 年度初頭, 年度末
const HALF = 3; // 年度上半期 / 年度下半期
const YEAR = 4;

// Stands in for "the end of the month". Being at least as large as any real day
// is all it has to be: it puts a month-granularity value after every dated entry
// of that month while still keeping it inside the month, so a month shorter than
// 31 days needs no special case.
const LAST_DAY = 31;

// Month each season ends in. The sheet writes calendar years, so 2026冬 is the
// winter that starts in December 2026 and runs into February 2027.
const SEASON_END: Record<string, { yearOffset: number; month: number }> = {
    春: { yearOffset: 0, month: 5 },
    夏: { yearOffset: 0, month: 8 },
    秋: { yearOffset: 0, month: 11 },
    冬: { yearOffset: 1, month: 2 },
};

const EXACT_PATTERN = /^(\d{4})-(\d{2})(?:-(\d{2}))?/;
const SEASON_PATTERN = /^(\d{4})年?(春|夏|秋|冬)/;
const FISCAL_PATTERN = /^(\d{4})年?度(.*)$/;
// Last resort: any value opening with a year lands at the end of that year.
const YEAR_PATTERN = /^(\d{4})/;

// Last month a 年度 qualifier can mean, as an offset from the fiscal year that
// starts in April: the fiscal year itself ends in the March of the following
// calendar year. An unrecognised qualifier keeps that end, which is the latest
// point the 年度 can mean and so never claims a station opens sooner.
function fiscalEnd(qualifier: string): { yearOffset: number; month: number; granularity: number } {
    if (/^(初頭|初め|当初)/.test(qualifier)) {
        return { yearOffset: 0, month: 6, granularity: QUARTER };
    }
    if (/^(上半期|上期|前半)/.test(qualifier)) {
        return { yearOffset: 0, month: 9, granularity: HALF };
    }
    if (/^(下半期|下期|後半)/.test(qualifier)) {
        return { yearOffset: 1, month: 3, granularity: HALF };
    }
    if (qualifier.startsWith('末')) {
        return { yearOffset: 1, month: 3, granularity: QUARTER };
    }
    return { yearOffset: 1, month: 3, granularity: YEAR };
}

// A `date` value as [year, month, day, granularity]. A cell naming no year at
// all sorts to the very end.
function planDateKey(date: string): number[] {
    const value = date.trim();

    const exact = EXACT_PATTERN.exec(value);
    if (exact) {
        const [, year, month, day] = exact;
        return day === undefined
            ? [Number(year), Number(month), LAST_DAY, MONTH]
            : [Number(year), Number(month), Number(day), DAY];
    }

    const season = SEASON_PATTERN.exec(value);
    if (season) {
        const end = SEASON_END[season[2]];
        return [Number(season[1]) + end.yearOffset, end.month, LAST_DAY, QUARTER];
    }

    const fiscal = FISCAL_PATTERN.exec(value);
    if (fiscal) {
        const end = fiscalEnd(fiscal[2]);
        return [Number(fiscal[1]) + end.yearOffset, end.month, LAST_DAY, end.granularity];
    }

    const year = YEAR_PATTERN.exec(value);
    if (year) {
        return [Number(year[1]), 12, LAST_DAY, YEAR];
    }

    return [Number.POSITIVE_INFINITY, 0, 0, YEAR];
}

// Prefectures in the order they first appear in the city table, which
// data/cities.json lists in 全国地方公共団体コード order.
function prefectureRanks(cities: City[]): Map<string, number> {
    const ranks = new Map<string, number>();
    for (const city of cities) {
        if (!ranks.has(city.pref)) {
            ranks.set(city.pref, ranks.size);
        }
    }
    return ranks;
}

// Categories whose date carries no order: 計画中(未定) has none by definition,
// and the date left on a frozen or cancelled plan is a schedule that is not
// being worked towards. All three fall back to prefecture order.
const ORDERED_BY_PREFECTURE = new Set<Category>(['計画中(未定)', '凍結', '中止']);

function sortKey(station: PlannedStation, prefectureRank: Map<string, number>): number[] {
    const category = categoryOf(station);
    // Unknown prefectures (a typo in the sheet) sort after every known one.
    const pref = prefectureRank.get(station.pref) ?? prefectureRank.size;
    const head = CATEGORIES.indexOf(category);

    return ORDERED_BY_PREFECTURE.has(category) ? [head, pref] : [head, ...planDateKey(station.date), pref];
}

function compareKeys(a: number[], b: number[]): number {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
        if (a[i] !== b[i]) {
            return a[i] - b[i];
        }
    }
    return 0;
}

export function sortPlannedStations(stations: PlannedStation[], cities: City[]): PlannedStation[] {
    const prefectureRank = prefectureRanks(cities);
    const collator = new Intl.Collator('ja');

    return stations
        .map((station) => ({ station, key: sortKey(station, prefectureRank) }))
        .sort(
            (a, b) =>
                compareKeys(a.key, b.key) ||
                collator.compare(a.station.city, b.station.city) ||
                collator.compare(a.station.name, b.station.name)
        )
        .map((entry) => entry.station);
}
