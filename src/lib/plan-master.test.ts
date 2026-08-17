// Tests for the master's canonical form, against fixtures rather than the real
// file: what data/plans.json currently holds is the validator's subject
// (src/frontend/plan-data.test.ts), while these check the rules that decide what
// a write is allowed to do.
//
// `load` and `savePlans` are not exercised here -- they read and write the real
// paths. That they round-trip byte-for-byte is checked by running a command and
// reading `git diff`.

import { describe, expect, it } from 'vitest';
import type { City, PlanRecord } from '../frontend/types/plan';
import {
    addUrl,
    applyUpdates,
    checkInPlan,
    checkOutPlan,
    createPlan,
    createPlanComparator,
    findPlan,
    listPlans,
    MAX_URLS,
    type Master,
    removeUrl,
    replaceUrl,
    repointPlans,
    setUrlTitle,
} from './plan-master';

// In 全国地方公共団体コード order, the order the real cities.json is in: 北海道,
// then 福島県, then 福岡県. 沖縄県 is left out so it can stand for a prefecture
// the table does not know.
const CITIES: City[] = [
    { code: '012041', pref: '北海道', city: '旭川市', lat: 43.77, lng: 142.36 },
    { code: '014010', pref: '北海道', city: '岩内郡共和町', lat: 42.9, lng: 140.5 },
    { code: '072117', pref: '福島県', city: '田村市', lat: 37.4, lng: 140.5 },
    { code: '073229', pref: '福島県', city: '安達郡大玉村', lat: 37.5, lng: 140.4 },
    { code: '406058', pref: '福岡県', city: '田川郡川崎町', lat: 33.6, lng: 130.8 },
];

function plan(overrides: Partial<PlanRecord> = {}): PlanRecord {
    return {
        name: '道の駅 旭川市',
        pref: '北海道',
        city: '旭川市',
        status: '計画中',
        date: '',
        lat: null,
        lng: null,
        urls: [{ title: '旭川市 道の駅整備計画', url: 'https://example.jp/a' }],
        checked_on: '2026-01-01',
        ...overrides,
    };
}

function master(plans: PlanRecord[]): Master {
    return { plans, cities: CITIES };
}

function names(plans: PlanRecord[]): string[] {
    return plans.map((entry) => `${entry.pref} ${entry.city} ${entry.name}`);
}

function urls(entry: PlanRecord): string[] {
    return entry.urls.map((link) => link.url);
}

function manyUrls(count: number): PlanRecord['urls'] {
    return Array.from({ length: count }, (_, index) => ({
        title: `出典 ${index}`,
        url: `https://example.jp/${index}`,
    }));
}

describe('repointPlans', () => {
    // 田村市 stands in for a municipality the regenerated table renamed.
    const RENAMES = new Map([['福島県 田村市', { pref: '福島県', city: '安達郡大玉村' }]]);
    const renamed = plan({ name: 'あ', pref: '福島県', city: '田村市' });

    it('rewrites only the records the map names', () => {
        const plans = [renamed, plan({ name: 'い', city: '岩内郡共和町' })];

        expect(names(repointPlans(plans, CITIES, RENAMES))).toEqual([
            '北海道 岩内郡共和町 い',
            '福島県 安達郡大玉村 あ',
        ]);
    });

    it('writes both halves of the location', () => {
        const moved = new Map([['北海道 旭川市', { pref: '福岡県', city: '田川郡川崎町' }]]);

        const [repointed] = repointPlans([plan()], CITIES, moved);

        expect([repointed.pref, repointed.city]).toEqual(['福岡県', '田川郡川崎町']);
    });

    // Record order is the city table's order, so a regeneration that reorders
    // municipalities reorders the master -- whether or not anything was renamed.
    it('sorts to the table it is given, with nothing renamed', () => {
        const plans = [plan({ pref: '福岡県', city: '田川郡川崎町' }), plan({ city: '岩内郡共和町' })];

        expect(names(repointPlans(plans, CITIES, new Map()))).toEqual([
            '北海道 岩内郡共和町 道の駅 旭川市',
            '福岡県 田川郡川崎町 道の駅 旭川市',
        ]);
    });

    // Why it is left alone is on repointPlans; this holds it to that.
    it('leaves checked_on alone', () => {
        const [repointed] = repointPlans([renamed], CITIES, RENAMES);

        expect(repointed.checked_on).toBe('2026-01-01');
    });

    it('keeps the key order of a record it rewrites', () => {
        const [repointed] = repointPlans([renamed], CITIES, RENAMES);

        expect(Object.keys(repointed)).toEqual(Object.keys(renamed));
    });
});

describe('findPlan', () => {
    it('returns the matching plan without removing it', () => {
        const plans = [plan({ name: 'あ' }), plan({ name: 'い' })];

        expect(findPlan(plans, { name: 'い', pref: '北海道' }).name).toBe('い');
        expect(plans).toHaveLength(2);
    });
});

describe('checkOutPlan', () => {
    it('removes the matching plan from the master and returns it', () => {
        const state = master([plan({ name: 'あ' }), plan({ name: 'い' })]);

        const borrowed = checkOutPlan(state, { name: 'あ', pref: '北海道' });

        expect(borrowed.name).toBe('あ');
        expect(names(state.plans)).toEqual(['北海道 旭川市 い']);
    });

    // `name` alone is not a key: 道の駅 川崎町 exists in both 福岡県 and 宮城県.
    it('distinguishes same-named plans by prefecture', () => {
        const state = master([
            plan({ name: '道の駅 川崎町', pref: '北海道', city: '岩内郡共和町' }),
            plan({ name: '道の駅 川崎町', pref: '福岡県', city: '田川郡川崎町' }),
        ]);

        const borrowed = checkOutPlan(state, { name: '道の駅 川崎町', pref: '福岡県' });

        expect(borrowed.city).toBe('田川郡川崎町');
        expect(names(state.plans)).toEqual(['北海道 岩内郡共和町 道の駅 川崎町']);
    });

    // The failure jq hid: a `select` that matched nothing succeeded and printed
    // the file unchanged, so a write that did nothing looked like one that worked.
    it('throws when the key matches nothing', () => {
        const state = master([plan()]);

        expect(() => checkOutPlan(state, { name: '道の駅 旭川', pref: '北海道' })).toThrow(
            'No plan named 道の駅 旭川 in 北海道'
        );
        expect(state.plans).toHaveLength(1);
    });

    it('throws when the key matches more than one plan', () => {
        const state = master([plan(), plan()]);

        expect(() => checkOutPlan(state, { name: '道の駅 旭川市', pref: '北海道' })).toThrow(
            '2 plans named 道の駅 旭川市 in 北海道'
        );
    });
});

describe('createPlanComparator', () => {
    const compare = createPlanComparator(CITIES);

    it('orders prefectures by their first appearance in the city table', () => {
        const hokkaido = plan({ pref: '北海道', city: '旭川市' });
        const fukuoka = plan({ pref: '福岡県', city: '田川郡川崎町' });

        expect(compare(hokkaido, fukuoka)).toBeLessThan(0);
        expect(compare(fukuoka, hokkaido)).toBeGreaterThan(0);
    });

    it('orders cities within a prefecture by the same table', () => {
        const asahikawa = plan({ city: '旭川市' });
        const kyowa = plan({ city: '岩内郡共和町' });

        expect(compare(asahikawa, kyowa)).toBeLessThan(0);
    });

    it('orders plans in one city by name', () => {
        expect(compare(plan({ name: 'あ' }), plan({ name: 'い' }))).toBeLessThan(0);
        expect(compare(plan({ name: 'あ' }), plan({ name: 'あ' }))).toBe(0);
    });

    // A city the table does not know cannot be placed among the ones it does, so
    // it goes after them -- and string order at least keeps it deterministic.
    it('sends a city the table does not know to the end of its prefecture', () => {
        expect(compare(plan({ city: '旭川市' }), plan({ city: '幌加内町' }))).toBeLessThan(0);
    });

    it('orders two unknown cities by string comparison', () => {
        // 妹 (U+59B9) sorts before 幌 (U+5E4C).
        expect(compare(plan({ city: '妹背牛町' }), plan({ city: '幌加内町' }))).toBeLessThan(0);
    });
});

describe('checkInPlan', () => {
    // The date is not an argument: check-in is the only way into the master, so
    // stamping unconditionally here is what makes it unskippable.
    it('stamps checked_on with today in Japan', () => {
        const state = master([]);
        const entry = plan({ checked_on: '2026-01-01' });

        checkInPlan(state, entry);

        expect(entry.checked_on).toBe(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' }));
    });

    it('inserts at the sorted position rather than the end', () => {
        const state = master([plan({ city: '旭川市', name: 'あ' }), plan({ pref: '福岡県', city: '田川郡川崎町' })]);

        checkInPlan(state, plan({ city: '岩内郡共和町', name: 'う' }));

        expect(names(state.plans)).toEqual([
            '北海道 旭川市 あ',
            '北海道 岩内郡共和町 う',
            '福岡県 田川郡川崎町 道の駅 旭川市',
        ]);
    });

    it('appends when the plan sorts last', () => {
        const state = master([plan({ city: '旭川市' })]);

        checkInPlan(state, plan({ pref: '福岡県', city: '田川郡川崎町' }));

        expect(names(state.plans)).toEqual(['北海道 旭川市 道の駅 旭川市', '福岡県 田川郡川崎町 道の駅 旭川市']);
    });

    // The whole point of checking out before editing: a rename changes where the
    // record belongs, and nothing has to re-find it to move it.
    it('puts a renamed plan at its new position', () => {
        const state = master([plan({ name: 'あ' }), plan({ name: 'い' }), plan({ name: 'う' })]);
        const borrowed = checkOutPlan(state, { name: 'あ', pref: '北海道' });

        applyUpdates(borrowed, { name: 'え' });
        checkInPlan(state, borrowed);

        expect(names(state.plans)).toEqual(['北海道 旭川市 い', '北海道 旭川市 う', '北海道 旭川市 え']);
    });

    it('moves a plan whose prefecture was corrected into the new block', () => {
        const state = master([plan({ name: 'あ' }), plan({ pref: '福島県', city: '田村市', name: 'い' })]);
        const borrowed = checkOutPlan(state, { name: 'あ', pref: '北海道' });

        applyUpdates(borrowed, { pref: '福岡県', city: '田川郡川崎町' });
        checkInPlan(state, borrowed);

        expect(names(state.plans)).toEqual(['福島県 田村市 い', '福岡県 田川郡川崎町 あ']);
    });

    // A rename onto an existing key and a duplicate `add` are the same mistake,
    // so they land on the same check.
    it('throws when the key is already taken', () => {
        const state = master([plan({ name: 'あ' })]);

        expect(() => checkInPlan(state, plan({ name: 'あ' }))).toThrow('is already in the master');
        expect(state.plans).toHaveLength(1);
    });

    it('throws when the prefecture is unknown to the city table', () => {
        const state = master([]);

        expect(() => checkInPlan(state, plan({ pref: '沖縄県', city: '那覇市' }))).toThrow(
            'Unknown prefecture: 沖縄県'
        );
        expect(state.plans).toHaveLength(0);
    });

    // The municipality places a record with no coordinates and orders every record
    // in the file, so a name the table does not carry is not writable -- including
    // the current name of a municipality the table has not caught up with.
    it('throws when the municipality is unknown to the city table', () => {
        const state = master([]);

        expect(() => checkInPlan(state, plan({ pref: '北海道', city: '幌加内町' }))).toThrow(
            'Unknown municipality: 幌加内町 in 北海道'
        );
        expect(state.plans).toHaveLength(0);
    });

    it('throws when the municipality is empty, which matches nothing', () => {
        const state = master([]);

        expect(() => checkInPlan(state, plan({ city: '' }))).toThrow('Unknown municipality');
        expect(state.plans).toHaveLength(0);
    });
});

describe('applyUpdates', () => {
    it('writes only the fields it is given', () => {
        const entry = plan({ status: '計画中', date: '2028春' });

        applyUpdates(entry, { status: '登録済み' });

        expect(entry.status).toBe('登録済み');
        expect(entry.date).toBe('2028春');
    });

    it('clears a coordinate when given null', () => {
        const entry = plan({ lat: 43.77, lng: 142.36 });

        applyUpdates(entry, { lat: null, lng: null });

        expect(entry.lat).toBeNull();
        expect(entry.lng).toBeNull();
    });

    // The date column records whatever precision is known, so no pattern fits.
    it('accepts any date text', () => {
        const entry = plan();

        for (const date of ['2026-04-01', '2026-04', '2026年度', '2026夏ごろ', '']) {
            applyUpdates(entry, { date });
            expect(entry.date).toBe(date);
        }
    });

    it('rejects a status outside the five values', () => {
        expect(() => applyUpdates(plan(), { status: '着工' })).toThrow('Invalid status: 着工');
    });

    it('rejects an empty name', () => {
        expect(() => applyUpdates(plan(), { name: '  ' })).toThrow('Invalid name');
    });

    it.each([Number.NaN, Number.POSITIVE_INFINITY])('rejects the coordinate %p', (lat) => {
        expect(() => applyUpdates(plan(), { lat })).toThrow('Invalid lat');
    });
});

describe('addUrl', () => {
    it('appends the source', () => {
        const entry = plan();

        addUrl(entry, { title: '新しい出典', url: 'https://example.jp/b' });

        expect(urls(entry)).toEqual(['https://example.jp/a', 'https://example.jp/b']);
    });

    it('rejects a source the plan already cites', () => {
        const entry = plan();

        expect(() => addUrl(entry, { title: '同じ', url: 'https://example.jp/a' })).toThrow('already cites');
    });

    it('rejects the eleventh source', () => {
        const entry = plan({ urls: manyUrls(MAX_URLS) });

        expect(() => addUrl(entry, { title: '11 本目', url: 'https://example.jp/new' })).toThrow(
            `already holds ${MAX_URLS} urls`
        );
        expect(entry.urls).toHaveLength(MAX_URLS);
    });

    it('rejects a blank title', () => {
        expect(() => addUrl(plan(), { title: '  ', url: 'https://example.jp/b' })).toThrow('Invalid title');
    });

    it('rejects a url that is not http or https', () => {
        expect(() => addUrl(plan(), { title: 'ftp', url: 'ftp://example.jp/b' })).toThrow('Invalid url');
    });
});

describe('replaceUrl', () => {
    it('writes the new source over the old one, in place', () => {
        const entry = plan({ urls: manyUrls(3) });

        replaceUrl(entry, 'https://example.jp/1', { title: '後継記事', url: 'https://example.jp/new' });

        expect(urls(entry)).toEqual(['https://example.jp/0', 'https://example.jp/new', 'https://example.jp/2']);
    });

    // The reason this operation exists: on a full record the count never leaves
    // ten, so there is no order to get right.
    it('keeps a full record at ten sources', () => {
        const entry = plan({ urls: manyUrls(MAX_URLS) });

        replaceUrl(entry, 'https://example.jp/0', { title: '入れ替え', url: 'https://example.jp/new' });

        expect(entry.urls).toHaveLength(MAX_URLS);
    });

    it('accepts the same url, which rewrites only the title', () => {
        const entry = plan();

        replaceUrl(entry, 'https://example.jp/a', { title: '見出しを写し直した', url: 'https://example.jp/a' });

        expect(entry.urls).toEqual([{ title: '見出しを写し直した', url: 'https://example.jp/a' }]);
    });

    it('rejects a url the plan does not cite', () => {
        const entry = plan();

        expect(() => replaceUrl(entry, 'https://example.jp/z', { title: 'あ', url: 'https://example.jp/b' })).toThrow(
            'does not cite https://example.jp/z'
        );
        expect(urls(entry)).toEqual(['https://example.jp/a']);
    });

    it('rejects a new url the plan already cites elsewhere', () => {
        const entry = plan({ urls: manyUrls(3) });

        expect(() => replaceUrl(entry, 'https://example.jp/0', { title: 'あ', url: 'https://example.jp/2' })).toThrow(
            'already cites'
        );
    });
});

describe('removeUrl', () => {
    it('removes the source', () => {
        const entry = plan({ urls: manyUrls(3) });

        removeUrl(entry, 'https://example.jp/1');

        expect(urls(entry)).toEqual(['https://example.jp/0', 'https://example.jp/2']);
    });

    // A record with no source is a claim with nothing behind it, and CI rejects
    // it -- so the write is refused before it reaches the file.
    it('refuses to leave the plan with no source', () => {
        const entry = plan();

        expect(() => removeUrl(entry, 'https://example.jp/a')).toThrow('would leave the plan with no source');
        expect(entry.urls).toHaveLength(1);
    });

    it('rejects a url the plan does not cite', () => {
        expect(() => removeUrl(plan({ urls: manyUrls(3) }), 'https://example.jp/z')).toThrow('does not cite');
    });
});

describe('setUrlTitle', () => {
    it('rewrites the title, leaving the url and its position alone', () => {
        const entry = plan({ urls: manyUrls(3) });

        setUrlTitle(entry, 'https://example.jp/1', '本当の見出し');

        expect(entry.urls[1]).toEqual({ title: '本当の見出し', url: 'https://example.jp/1' });
        expect(urls(entry)).toEqual(['https://example.jp/0', 'https://example.jp/1', 'https://example.jp/2']);
    });

    it('rejects a blank title', () => {
        expect(() => setUrlTitle(plan(), 'https://example.jp/a', ' ')).toThrow('Invalid title');
    });

    it('rejects a url the plan does not cite', () => {
        expect(() => setUrlTitle(plan(), 'https://example.jp/z', 'あ')).toThrow('does not cite');
    });
});

describe('createPlan', () => {
    const fields = { name: 'あ', pref: '北海道', city: '旭川市', status: '計画中' };
    const link = { title: '整備計画', url: 'https://example.jp/new' };

    it('builds the nine keys in the fixed order', () => {
        expect(Object.keys(createPlan(fields, link))).toEqual([
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

    it('fills in the unknown columns and leaves checked_on for check-in', () => {
        const entry = createPlan(fields, link);

        expect(entry.date).toBe('');
        expect(entry.lat).toBeNull();
        expect(entry.lng).toBeNull();
        expect(entry.checked_on).toBe('');
        expect(entry.urls).toEqual([link]);
    });

    it('keeps the date and coordinates it is given', () => {
        const entry = createPlan({ ...fields, date: '2028年度', lat: 43.77, lng: 142.36 }, link);

        expect([entry.date, entry.lat, entry.lng]).toEqual(['2028年度', 43.77, 142.36]);
    });

    it.each(['name', 'pref', 'city', 'status'])('rejects a new plan with no %s', (missing) => {
        const partial = { ...fields, [missing]: '' };

        expect(() => createPlan(partial, link)).toThrow('A new plan needs');
    });

    it('rejects a status outside the five values', () => {
        expect(() => createPlan({ ...fields, status: '着工' }, link)).toThrow('Invalid status');
    });

    it('rejects a source the map could not render', () => {
        expect(() => createPlan(fields, { title: ' ', url: 'https://example.jp/new' })).toThrow('Invalid title');
    });
});

describe('listPlans', () => {
    const plans = [
        plan({ name: 'あ', status: '計画中', checked_on: '2026-03-01' }),
        plan({ name: 'い', status: '開業', checked_on: '2026-01-01' }),
        plan({ name: 'う', status: '凍結', checked_on: '2026-02-01' }),
        plan({ name: 'え', status: '登録済み', checked_on: '2026-02-01' }),
    ];

    it('returns every plan when given no options', () => {
        expect(listPlans(plans, {})).toHaveLength(4);
    });

    it('keeps only the given statuses', () => {
        const selected = listPlans(plans, { statuses: ['計画中', '凍結'] });

        expect(selected.map((entry) => entry.name)).toEqual(['あ', 'う']);
    });

    // Stable, so plans stamped on the same day stay in file order (which is
    // prefecture order) and the result is reproducible.
    it('orders by checked_on, oldest first, keeping file order on ties', () => {
        const selected = listPlans(plans, { sort: 'checked_on' });

        expect(selected.map((entry) => entry.name)).toEqual(['い', 'う', 'え', 'あ']);
    });

    it('does not reorder the array it was given', () => {
        listPlans(plans, { sort: 'checked_on' });

        expect(plans.map((entry) => entry.name)).toEqual(['あ', 'い', 'う', 'え']);
    });

    it('cuts the result to the limit', () => {
        expect(listPlans(plans, { sort: 'checked_on', limit: 2 }).map((entry) => entry.name)).toEqual(['い', 'う']);
    });

    it('rejects a status outside the five values', () => {
        expect(() => listPlans(plans, { statuses: ['着工'] })).toThrow('Invalid status: 着工');
    });
});
