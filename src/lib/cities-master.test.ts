// Rules for turning ABR rows into the municipality table. Fixtures throughout:
// the real files are checked by `src/frontend/cities-data.test.ts`, and the rule
// that matters most here -- what happens on the day a merger takes effect --
// cannot be exercised against whatever the registry publishes today.
import { describe, expect, it } from 'vitest';
import type { City } from '../frontend/types/plan';
import type { AbrCity, AbrPosition } from './abr';
import { buildCities, diffCities } from './cities-master';

// The effective and abolition rules turn on which side of TODAY a date falls,
// so a test names the side rather than the date.
const YESTERDAY = '2026-08-16';
const TODAY = '2026-08-17';
const TOMORROW = '2026-08-18';

function row(overrides: Partial<AbrCity> = {}): AbrCity {
    return {
        lg_code: '012041',
        pref: '北海道',
        county: '',
        city: '旭川市',
        ward: '',
        efct_date: '1947-04-17',
        ablt_date: '',
        ...overrides,
    };
}

function at(lg_code: string, lat: string, lng: string): AbrPosition {
    return { lg_code, rep_lat: lat, rep_lon: lng };
}

function build(rows: AbrCity[], positions: AbrPosition[] = rows.map((r) => at(r.lg_code, '43.0', '141.0'))) {
    return buildCities(rows, positions, TODAY);
}

function city(overrides: Partial<City> = {}): City {
    return { code: '012041', pref: '北海道', city: '旭川市', lat: 43, lng: 141, ...overrides };
}

describe('buildCities', () => {
    it('joins names and coordinates on lg_code', () => {
        const cities = build([row()], [at('012041', '43.77', '142.36')]);

        expect(cities).toEqual([{ code: '012041', pref: '北海道', city: '旭川市', lat: 43.77, lng: 142.36 }]);
    });

    // 郡 and 政令市の区 are separate columns upstream; the table carries the name
    // as it is written on an address, which is those columns run together.
    it('writes the county into the name', () => {
        const cities = build([row({ lg_code: '203831', pref: '長野県', county: '上伊那郡', city: '箕輪町' })]);

        expect(cities[0].city).toBe('上伊那郡箕輪町');
    });

    // Tokyo's 23 are municipalities in their own right: no city holds them, so
    // they arrive in the `city` column and the designated-city rule never sees
    // them.
    it('keeps a special ward as its own municipality', () => {
        const cities = build([row({ lg_code: '131016', pref: '東京都', city: '千代田区' })]);

        expect(cities.map((c) => c.city)).toEqual(['千代田区']);
    });

    // The designated-city rule at the top of cities-master.ts.
    it('drops the wards of a designated city and keeps the city', () => {
        const rows = [
            row({ lg_code: '221309', pref: '静岡県', city: '浜松市' }),
            row({ lg_code: '221384', pref: '静岡県', city: '浜松市', ward: '中央区' }),
            row({ lg_code: '221406', pref: '静岡県', city: '浜松市', ward: '天竜区' }),
        ];

        const cities = build(rows);

        expect(cities.map((c) => c.city)).toEqual(['浜松市']);
    });

    it('drops a row with no name', () => {
        const cities = build([row(), row({ lg_code: '010006', city: '' })]);

        expect(cities.map((c) => c.code)).toEqual(['012041']);
    });

    // ABR publishes a merger from the day it is decided. Taking it early would
    // break data/plans.json against a municipality that still exists.
    it('ignores a row that has not taken effect yet', () => {
        const cities = build([row({ efct_date: TOMORROW })]);

        expect(cities).toEqual([]);
    });

    it('takes a row on the day it takes effect', () => {
        const cities = build([row({ efct_date: TODAY })]);

        expect(cities).toHaveLength(1);
    });

    it('drops a row that has been abolished, and keeps one that is about to be', () => {
        const rows = [row({ ablt_date: YESTERDAY }), row({ lg_code: '012050', ablt_date: TOMORROW })];

        const cities = build(rows);

        expect(cities.map((c) => c.code)).toEqual(['012050']);
    });

    // 伊達市 is in both 北海道 and 福島県, 府中市 in both 東京都 and 広島県.
    it('keeps municipalities that share a name', () => {
        const rows = [
            row({ lg_code: '012335', pref: '北海道', city: '伊達市' }),
            row({ lg_code: '072133', pref: '福島県', city: '伊達市' }),
        ];

        const cities = build(rows);

        expect(cities.map((c) => c.pref)).toEqual(['北海道', '福島県']);
    });

    it('sorts by code, whatever order the source is in', () => {
        const rows = [row({ lg_code: '472018' }), row({ lg_code: '012041' }), row({ lg_code: '131016' })];

        const cities = build(rows);

        expect(cities.map((c) => c.code)).toEqual(['012041', '131016', '472018']);
    });

    it('refuses a coordinate that is not a number', () => {
        expect(() => build([row()], [at('012041', '43.77', '')])).toThrow('not a number');
    });

    it('refuses a row whose coordinates it cannot join', () => {
        const rows = [row(), row({ lg_code: '012050', city: '室蘭市' })];

        expect(() => build(rows, [at('012041', '43.77', '142.36')])).toThrow(
            'No representative point joined to 012050'
        );
    });
});

describe('diffCities', () => {
    it('reports what appeared and what went away', () => {
        const previous = [city(), city({ code: '012050', city: '室蘭市' })];
        const next = [city(), city({ code: '012068', city: '釧路市' })];

        const diff = diffCities(previous, next);

        expect(diff.added.map((c) => c.city)).toEqual(['釧路市']);
        expect(diff.removed.map((c) => c.city)).toEqual(['室蘭市']);
    });

    // The only way a rename is recognisable: 篠山市 and 丹波篠山市 are both
    // 282219, and no comparison of the names establishes that.
    it('reads a code that survived under another name as a rename', () => {
        const previous = [city({ code: '282219', pref: '兵庫県', city: '篠山市' })];
        const next = [city({ code: '282219', pref: '兵庫県', city: '丹波篠山市' })];

        const diff = diffCities(previous, next);

        expect(diff.renamed.map((change) => [change.from.city, change.to.city])).toEqual([['篠山市', '丹波篠山市']]);
        expect(diff.added).toEqual([]);
        expect(diff.removed).toEqual([]);
    });

    // The table this replaced predates the code field, so the first
    // regeneration has nothing to match on. Renames read as an add and a remove
    // there, which is what a migration reviewed by hand wants anyway.
    it('falls back to names when the previous table has no codes', () => {
        const previous = [{ pref: '兵庫県', city: '篠山市', lat: 35, lng: 135 } as City];
        const next = [city({ code: '282219', pref: '兵庫県', city: '丹波篠山市', lat: 35, lng: 135 })];

        const diff = diffCities(previous, next);

        expect(diff.renamed).toEqual([]);
        expect(diff.added.map((c) => c.city)).toEqual(['丹波篠山市']);
        expect(diff.removed.map((c) => c.city)).toEqual(['篠山市']);
    });
});
