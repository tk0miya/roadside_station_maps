// Validator for the discovery queue (`data/discovery.json`).
//
// The queue is written by `npm run plan -- discovery done`, but like the plan
// master it can be edited by hand, so this reads the real file: a prefecture
// that went missing would silently drop out of discovery for good.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { City } from './types/plan';

function read<T>(path: string): T {
    return JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));
}

// Held untyped on purpose: what these tests check is that the file IS a map of
// prefecture to date.
const discovery = read<Record<string, unknown>>('data/discovery.json');
const cities = read<City[]>('data/cities.json');

// Prefectures in first-appearance order of cities.json, which is code order.
const prefectures = [...new Set(cities.map((city) => city.pref))];

describe('data/discovery.json', () => {
    // Also the order check: listDiscovery breaks ties by file order.
    it('holds every prefecture of cities.json exactly once, in code order', () => {
        expect(Object.keys(discovery)).toEqual(prefectures);
    });

    it('has a yyyy-mm-dd date on every prefecture', () => {
        for (const [pref, date] of Object.entries(discovery)) {
            expect(date, pref).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        }
    });
});
