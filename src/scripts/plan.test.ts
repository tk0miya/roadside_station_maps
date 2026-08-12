// The guards are what these cover, one test per rule the writer enforces. The
// happy paths are checked for key order and placement -- the two things a
// record can get wrong while every one of its values is correct.

import { describe, expect, it } from 'vitest';
import type { City, PlanRecord } from '../frontend/types/plan';
import {
    addUrl,
    buildRecord,
    coordinatePatch,
    coordinateWarning,
    describeChange,
    describeQueue,
    describeRecord,
    findRecord,
    insertRecord,
    movesRecord,
    parseCoordinate,
    parseFlags,
    removeUrl,
    replaceRecord,
    setFields,
    todayInJst,
} from './plan';

const TODAY = '2026-08-12';

function record(overrides: Partial<PlanRecord> = {}): PlanRecord {
    return {
        name: '道の駅 石川町',
        pref: '福島県',
        city: '石川郡石川町',
        status: '計画中',
        date: '2026-09',
        lat: null,
        lng: null,
        urls: [{ title: '整備計画', url: 'https://example.jp/plan' }],
        checked_on: '2026-06-02',
        ...overrides,
    };
}

// Two prefectures, in code order, with one city each.
const CITIES: City[] = [
    { pref: '北海道', city: '旭川市', lat: 43.77, lng: 142.36 },
    { pref: '福島県', city: '石川郡石川町', lat: 37.15, lng: 140.44 },
    { pref: '福島県', city: '西白河郡泉崎村', lat: 37.13, lng: 140.31 },
];

describe('todayInJst', () => {
    it('reads the date in Japan, not the machine timezone', () => {
        // 2026-08-11 22:00 UTC is already the 12th in JST.
        expect(todayInJst(new Date('2026-08-11T22:00:00Z'))).toBe('2026-08-12');
    });
});

describe('findRecord', () => {
    const records = [record(), record({ name: '道の駅 川崎町', pref: '福岡県' })];

    it('finds a record by name and prefecture', () => {
        expect(findRecord(records, '道の駅 川崎町', '福岡県')).toBe(1);
    });

    it('fails instead of matching nothing', () => {
        expect(() => findRecord(records, '道の駅 石川町', '宮城県')).toThrow(/no record matches/);
    });

    // plan-data.test.ts keeps the master free of these, so this only fires on
    // input from somewhere else -- but writing to one of two matches at random
    // is the one outcome worse than refusing.
    it('fails instead of picking one of several matches', () => {
        expect(() => findRecord([record(), record()], '道の駅 石川町', '福島県')).toThrow(/2 records match/);
    });
});

describe('setFields', () => {
    it('stamps checked_on even when nothing else changes', () => {
        expect(setFields(record(), {}, TODAY).checked_on).toBe(TODAY);
    });

    it('writes each field it is given and leaves the rest alone', () => {
        const updated = setFields(record(), { status: '登録済み', date: '2026-09-18' }, TODAY);
        expect(updated.status).toBe('登録済み');
        expect(updated.date).toBe('2026-09-18');
        expect(updated.name).toBe('道の駅 石川町');
        expect(updated.urls).toEqual(record().urls);
    });

    it('clears the coordinates when given null', () => {
        const placed = record({ lat: 37.15, lng: 140.44 });
        expect(setFields(placed, { lat: null, lng: null }, TODAY)).toMatchObject({ lat: null, lng: null });
    });

    it('rejects a status the map cannot render', () => {
        expect(() => setFields(record(), { status: '着工' }, TODAY)).toThrow(/unknown status/);
    });

    it('rejects a rename to an empty name', () => {
        expect(() => setFields(record(), { name: '' }, TODAY)).toThrow(/empty name/);
    });
});

describe('addUrl', () => {
    it('appends a source and stamps the record', () => {
        const updated = addUrl(record(), { title: '開業日決定', url: 'https://example.jp/news' }, TODAY);
        expect(updated.urls).toEqual([
            { title: '整備計画', url: 'https://example.jp/plan' },
            { title: '開業日決定', url: 'https://example.jp/news' },
        ]);
        expect(updated.checked_on).toBe(TODAY);
    });

    it('rejects a duplicate url', () => {
        expect(() => addUrl(record(), { title: 'べつの見出し', url: 'https://example.jp/plan' }, TODAY)).toThrow(
            /already cites/
        );
    });

    it.each(['javascript:alert(1)', 'ftp://example.jp/plan', 'example.jp/plan', ''])(
        'rejects %j, which the info window would not link',
        (url) => {
            expect(() => addUrl(record(), { title: 'x', url }, TODAY)).toThrow(/not an http/);
        }
    );

    it('accepts both http and https', () => {
        expect(addUrl(record(), { title: 'x', url: 'http://example.jp/a' }, TODAY).urls).toHaveLength(2);
        expect(addUrl(record(), { title: 'x', url: 'HTTPS://example.jp/b' }, TODAY).urls).toHaveLength(2);
    });

    it('rejects a blank title, which the map would draw as an empty link', () => {
        expect(() => addUrl(record(), { title: '  ', url: 'https://example.jp/news' }, TODAY)).toThrow(/no title/);
    });
});

describe('removeUrl', () => {
    it('removes one source and leaves the others alone', () => {
        const two = record({
            urls: [
                { title: '生きている', url: 'https://example.jp/live' },
                { title: '死んでいる', url: 'https://example.jp/dead' },
            ],
        });
        expect(removeUrl(two, 'https://example.jp/dead', TODAY).urls).toEqual([
            { title: '生きている', url: 'https://example.jp/live' },
        ]);
    });

    it('fails on a url the record does not cite', () => {
        expect(() => removeUrl(record(), 'https://example.jp/plan/', TODAY)).toThrow(/cites no source/);
    });
});

describe('buildRecord', () => {
    const fields = {
        name: '道の駅 いずみざき',
        pref: '福島県',
        city: '西白河郡泉崎村',
        status: '計画中',
        date: '2028年度',
        lat: null,
        lng: null,
        urls: [{ title: '整備へ', url: 'https://example.jp/izumizaki' }],
        checked_on: TODAY,
    };

    it('writes the nine keys in the master order', () => {
        expect(Object.keys(buildRecord(fields))).toEqual([
            'name',
            'pref',
            'city',
            'status',
            'date',
            'lat',
            'lng',
            'urls',
            'checked_on',
        ]);
    });

    it('validates the sources it is given', () => {
        expect(() => buildRecord({ ...fields, urls: [{ title: 'x', url: 'ftp://example.jp' }] })).toThrow(
            /not an http/
        );
    });

    it('rejects a record with no name', () => {
        expect(() => buildRecord({ ...fields, name: '' })).toThrow(/needs a name/);
    });

    it('rejects a status the map cannot render', () => {
        expect(() => buildRecord({ ...fields, status: '着工' })).toThrow(/unknown status/);
    });
});

describe('insertRecord', () => {
    const asahikawa = record({ name: '道の駅 旭川市', pref: '北海道', city: '旭川市' });
    const ishikawa = record();
    const izumizaki = record({ name: '道の駅 いずみざき', pref: '福島県', city: '西白河郡泉崎村' });

    it('places a record in prefecture, city, then name order', () => {
        const inserted = insertRecord([asahikawa, izumizaki], ishikawa, CITIES);
        expect(inserted.map((r) => r.name)).toEqual(['道の駅 旭川市', '道の駅 石川町', '道の駅 いずみざき']);
    });

    // The tail is the common case: every prefecture's last station, and every
    // station in 沖縄県, appends rather than splices.
    it('appends a record that belongs after every existing one', () => {
        expect(insertRecord([asahikawa, ishikawa], izumizaki, CITIES).map((r) => r.name)).toEqual([
            '道の駅 旭川市',
            '道の駅 石川町',
            '道の駅 いずみざき',
        ]);
    });

    // The comparator is shared by the writer and the check that rejects a
    // misplaced record, so agreeing with itself proves nothing -- this branch
    // (a city cities.json does not list) needs its own answer to compare to.
    it('sorts cities the table does not list to the end of their prefecture, in string order', () => {
        const inserted = insertRecord(
            [record(), record({ name: '道の駅 B', city: '未知町B' })],
            record({ name: '道の駅 A', city: '未知町A' }),
            CITIES
        );
        expect(inserted.map((r) => r.city)).toEqual(['石川郡石川町', '未知町A', '未知町B']);
    });

    it('rejects a station the master already holds', () => {
        expect(() => insertRecord([ishikawa], record(), CITIES)).toThrow(/already in the master/);
    });

    it('rejects a prefecture cities.json does not know', () => {
        expect(() => insertRecord([], record({ pref: '東京都' }), CITIES)).toThrow(/unknown prefecture/);
    });
});

describe('movesRecord', () => {
    it('leaves a record in place when only its values change', () => {
        expect(movesRecord(record(), setFields(record(), { status: '開業', date: '2026-09-18' }, TODAY))).toBe(false);
    });

    it('re-places a renamed record', () => {
        expect(movesRecord(record(), setFields(record(), { name: '道の駅 いしかわ' }, TODAY))).toBe(true);
    });

    it('re-places a record filed under the wrong prefecture', () => {
        expect(movesRecord(record(), setFields(record(), { pref: '北海道' }, TODAY))).toBe(true);
    });

    it('re-places a record whose city was corrected', () => {
        expect(movesRecord(record({ city: '石川町' }), setFields(record(), { city: '石川郡石川町' }, TODAY))).toBe(
            true
        );
    });
});

describe('replaceRecord', () => {
    const asahikawa = record({ name: '道の駅 旭川市', pref: '北海道', city: '旭川市' });
    const izumizaki = record({ name: '道の駅 いずみざき', pref: '福島県', city: '西白河郡泉崎村' });
    const records = [asahikawa, record(), izumizaki];

    it('keeps the count and the position when the edit does not move the record', () => {
        const updated = replaceRecord(records, 1, setFields(record(), { status: '開業' }, TODAY), CITIES);
        expect(updated.map((r) => r.name)).toEqual(records.map((r) => r.name));
        expect(updated[1].status).toBe('開業');
    });

    // The edit has to land the record somewhere else, or this passes without
    // ever taking the move path.
    it('moves the record without losing any', () => {
        const moved = setFields(record(), { city: '西白河郡泉崎村' }, TODAY);
        const updated = replaceRecord(records, 1, moved, CITIES);
        expect(updated.map((r) => r.name)).toEqual(['道の駅 旭川市', '道の駅 いずみざき', '道の駅 石川町']);
    });
});

describe('coordinateWarning', () => {
    it('says nothing when the station has its own coordinates', () => {
        expect(coordinateWarning(record({ city: '石川町', lat: 37.15, lng: 140.44 }), CITIES)).toBeNull();
    });

    it('says nothing when the city carries the fallback point', () => {
        expect(coordinateWarning(record(), CITIES)).toBeNull();
    });

    it('warns when the map could not place the station', () => {
        expect(coordinateWarning(record({ city: '石川町' }), CITIES)).toMatch(/cannot place it/);
    });
});

describe('describeChange', () => {
    it('reports changed fields and moved sources', () => {
        const before = record();
        const swapped = addUrl(
            removeUrl(setFields(before, { status: '登録済み' }, TODAY), 'https://example.jp/plan', TODAY),
            { title: '登録されました', url: 'https://example.jp/registered' },
            TODAY
        );
        expect(describeChange(before, swapped)).toEqual([
            '  status     "計画中" -> "登録済み"',
            '  checked_on "2026-06-02" -> "2026-08-12"',
            '  + 登録されました  https://example.jp/registered',
            '  - 整備計画  https://example.jp/plan',
        ]);
    });

    it('reports nothing when every field kept its value', () => {
        expect(describeChange(record(), record())).toEqual([]);
    });
});

describe('describeRecord', () => {
    it('lists every field, without the markers of a change summary', () => {
        expect(describeRecord(record())).toEqual([
            '  name       "道の駅 石川町"',
            '  pref       "福島県"',
            '  city       "石川郡石川町"',
            '  status     "計画中"',
            '  date       "2026-09"',
            '  lat        null',
            '  lng        null',
            '  checked_on "2026-06-02"',
            '  urls       整備計画  https://example.jp/plan',
        ]);
    });
});

describe('describeQueue', () => {
    const queue = [
        record({ name: '道の駅 A', status: '計画中', checked_on: '2026-01-01' }),
        record({ name: '道の駅 B', status: '開業', checked_on: '2020-01-01' }),
        record({ name: '道の駅 C', status: '凍結', checked_on: '2026-01-01' }),
        record({ name: '道の駅 D', status: '中止', checked_on: '2019-01-01' }),
        record({ name: '道の駅 E', status: '登録済み', checked_on: '2026-05-05' }),
    ];

    // 開業 and 中止 are finished stories, so their older stamps must not pull
    // them to the front of a queue they are not in.
    it('lists the oldest page of the statuses that can still move', () => {
        const lines = describeQueue(queue, 2);
        expect(lines.slice(0, 2).map((line) => line.split('\t')[4])).toEqual(['道の駅 A', '道の駅 C']);
    });

    // The totals are what tell the skill whether another session is worth
    // running, so they cover the whole queue rather than the page.
    it('counts the whole queue, not just the page', () => {
        expect(describeQueue(queue, 2).at(-1)).toBe('3 queued; oldest checked_on 2026-01-01, shared by 2');
    });
});

describe('parseFlags', () => {
    it('reads flag/value pairs', () => {
        expect(parseFlags(['--name', '道の駅 石川町', '--pref', '福島県'], ['name', 'pref'])).toEqual({
            name: '道の駅 石川町',
            pref: '福島県',
        });
    });

    it('rejects a misspelled flag instead of ignoring it', () => {
        expect(() => parseFlags(['--stauts', '開業'], ['status'])).toThrow(/unknown flag/);
    });

    it('rejects a flag with no value', () => {
        expect(() => parseFlags(['--status'], ['status'])).toThrow(/needs a value/);
    });

    it('rejects the same flag twice', () => {
        expect(() => parseFlags(['--status', '開業', '--status', '中止'], ['status'])).toThrow(/given twice/);
    });

    it('rejects a bare value where a flag belongs', () => {
        expect(() => parseFlags(['開業'], ['status'])).toThrow(/expected a --flag/);
    });
});

describe('coordinatePatch', () => {
    it('reads a coordinate pair', () => {
        expect(coordinatePatch({ lat: '37.15', lng: '140.44' })).toEqual({ lat: 37.15, lng: 140.44 });
    });

    it('leaves the coordinates alone when neither is given', () => {
        expect(coordinatePatch({ status: '開業' })).toEqual({});
    });

    it('rejects a swapped pair', () => {
        expect(() => coordinatePatch({ lat: '140.44', lng: '37.15' })).toThrow(/outside Japan/);
    });

    it('rejects half a coordinate', () => {
        expect(() => coordinatePatch({ lat: '37.15' })).toThrow(/go together/);
        expect(() => coordinatePatch({ lat: 'null', lng: '140.44' })).toThrow(/both null or both numbers/);
    });
});

describe('parseCoordinate', () => {
    it('reads a number and the explicit null', () => {
        expect(parseCoordinate('37.15')).toBe(37.15);
        expect(parseCoordinate('-12.5')).toBe(-12.5);
        expect(parseCoordinate('null')).toBeNull();
    });

    it('rejects a value that is not a coordinate', () => {
        expect(() => parseCoordinate('37.15N')).toThrow(/not a coordinate/);
    });

    it('rejects the empty string instead of reading it as zero', () => {
        expect(() => parseCoordinate('')).toThrow(/not a coordinate/);
    });
});
