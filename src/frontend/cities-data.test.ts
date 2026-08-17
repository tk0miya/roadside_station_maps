// Validator for the municipality table (`data/cities.json`): the shape and the
// ordering its readers depend on.
//
// The file is written by `npm run generate:cities` from デジタル庁 ABR, so this
// checks the artefact rather than the generator: what matters is that the file
// on disk holds a usable table, whichever run produced it.
//
// Unlike `plan-data.test.ts`, layout is checked here. That test can leave
// formatting to Biome; this one cannot, because `data/` is gitignored and Biome
// never sees this file. One record per line is what makes a regeneration's diff
// readable, so it is part of what the file has to be.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Not derivable from a type at runtime, so this one is spelled out.
const KEYS = ['code', 'pref', 'city', 'lat', 'lng'];

// The 47 prefectures in 全国地方公共団体コード order. Spelled out rather than
// derived from the file, because their order IS the thing being checked:
// `plan-order.ts` reads first appearance here as prefecture order.
const PREFECTURES = [
    '北海道',
    '青森県',
    '岩手県',
    '宮城県',
    '秋田県',
    '山形県',
    '福島県',
    '茨城県',
    '栃木県',
    '群馬県',
    '埼玉県',
    '千葉県',
    '東京都',
    '神奈川県',
    '新潟県',
    '富山県',
    '石川県',
    '福井県',
    '山梨県',
    '長野県',
    '岐阜県',
    '静岡県',
    '愛知県',
    '三重県',
    '滋賀県',
    '京都府',
    '大阪府',
    '兵庫県',
    '奈良県',
    '和歌山県',
    '鳥取県',
    '島根県',
    '岡山県',
    '広島県',
    '山口県',
    '徳島県',
    '香川県',
    '愛媛県',
    '高知県',
    '福岡県',
    '佐賀県',
    '長崎県',
    '熊本県',
    '大分県',
    '宮崎県',
    '鹿児島県',
    '沖縄県',
];

const path = new URL('../../data/cities.json', import.meta.url);
const content = readFileSync(path, 'utf8');
// Held untyped on purpose: what these tests check is that the records ARE
// Cities, so typing them as such up front would assume the answer.
const cities = JSON.parse(content) as Record<string, unknown>[];

function label(city: Record<string, unknown>): string {
    return `${city.pref} ${city.city}`;
}

describe('data/cities.json', () => {
    it('has exactly the five fields, in order, on every record', () => {
        for (const city of cities) {
            expect(Object.keys(city), label(city)).toEqual(KEYS);
        }
    });

    it('has a six-digit code on every record', () => {
        for (const city of cities) {
            expect(city.code, label(city)).toMatch(/^\d{6}$/);
        }
    });

    // Whether the numbers are the right numbers is the registry's business.
    // That they are numbers at all is this file's, because JSON could hold a
    // string or a null here and City (src/frontend/types/plan.ts) says it does
    // not.
    it('has numeric coordinates on every record', () => {
        for (const city of cities) {
            expect(typeof city.lat, `${label(city)} / lat`).toBe('number');
            expect(typeof city.lng, `${label(city)} / lng`).toBe('number');
        }
    });

    // The ordering contract described on `City.code`, checked on the artefact.
    it('is sorted by code', () => {
        for (let i = 1; i < cities.length; i++) {
            const [before, after] = [cities[i - 1], cities[i]];
            expect(
                (before.code as string) < (after.code as string),
                `${before.code} ${label(before)} before ${after.code} ${label(after)}`
            ).toBe(true);
        }
    });

    // Also what catches an empty or truncated table: every test above passes on
    // a file with no records, this one does not.
    it('has all 47 prefectures, first appearing in code order', () => {
        const order: unknown[] = [];
        for (const city of cities) {
            if (!order.includes(city.pref)) {
                order.push(city.pref);
            }
        }
        expect(order).toEqual(PREFECTURES);
    });

    // The key data/plans.json writes its addresses in. The generator assembles
    // it from columns, so its uniqueness is this side's to hold.
    it('has no municipality twice', () => {
        const seen = new Set<string>();
        for (const city of cities) {
            expect(seen.has(label(city)), `duplicate: ${label(city)}`).toBe(false);
            seen.add(label(city));
        }
    });

    // Both halves of the rule in `cities-master.ts`: the wards of a designated
    // city are folded into it, and 東京都's 23 are not wards in that sense.
    it('carries designated cities whole and keeps the 23 special wards', () => {
        const wards = cities.filter((city) => /市.+区$/.test(city.city as string));
        expect(wards.map(label)).toEqual([]);
        expect(cities.filter((city) => city.pref === '東京都' && (city.city as string).endsWith('区'))).toHaveLength(
            23
        );
    });

    // The layout `saveCities` writes, checked here because Biome never sees this
    // file and a hand edit could quietly minify it back.
    it('is written one record per line', () => {
        const lines = content.trimEnd().split('\n');
        expect(lines).toHaveLength(cities.length + 2);
        expect(lines[0]).toBe('[');
        expect(lines[lines.length - 1]).toBe(']');
    });
});
