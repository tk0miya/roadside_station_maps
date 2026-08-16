// Validator for the development-plan master (`data/plans.json`).
//
// The master is written by `npm run plan` and edited by hand in GitHub's editor,
// so validation lives here rather than in whatever wrote it: this reads the real
// file, which means a broken edit from either source fails `npm run ci` on the
// pull request before it can be merged.
//
// Formatting (indent, key spacing) is deliberately NOT checked -- Biome owns
// that. Neither is a byte-for-byte match against a re-serialization, because
// number rendering varies by writer (36 vs 36.0) and would fail for reasons
// nobody could act on. The split is: Biome formats, this test validates
// structure.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// The comparator that decides record order, and the source ceiling, live with the
// CLI that writes the file: one definition both places the records and checks
// where they landed, and one number both refuses an eleventh source and fails the
// build if one gets in another way.
import { createPlanComparator, MAX_URLS } from '../lib/plan-master';
import type { City, PlanRecord } from './types/plan';
// The status vocabulary is defined once, where the map narrows it. Importing it
// rather than restating it means adding a Status also allows it in the data --
// otherwise the type would accept a value the master could not hold, and the
// mismatch would surface as a CI failure with no obvious cause.
import { STATUSES } from './types/plan';

// Not derivable from a type at runtime, so this one is spelled out.
const KEYS = ['name', 'pref', 'city', 'status', 'date', 'lat', 'lng', 'urls', 'checked_on'];
const URL_KEYS = ['title', 'url'];

function read<T>(path: string): T {
    return JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));
}

// Held untyped on purpose: what these tests check is that the file's records ARE
// PlanRecords, so typing them as such up front would assume the answer.
const plans = read<Record<string, unknown>[]>('data/plans.json');
const cities = read<City[]>('data/cities.json');

const prefs = new Set(cities.map((city) => city.pref));
const municipalities = new Set(cities.map((city) => `${city.pref} ${city.city}`));
const compareRecords = createPlanComparator(cities);

function label(record: Record<string, unknown>): string {
    return `${record.name} (${record.pref})`;
}

describe('data/plans.json', () => {
    it('is a non-empty array', () => {
        expect(Array.isArray(plans)).toBe(true);
        expect(plans.length).toBeGreaterThan(0);
    });

    it('has exactly the nine fields, in order, on every record', () => {
        // The order matters beyond diff stability: `name` is not unique
        // (道の駅 川崎町 exists in both 福岡県 and 宮城県), so `pref` has to sit
        // right next to it for a record to be identifiable at a glance.
        for (const record of plans) {
            expect(Object.keys(record), label(record)).toEqual(KEYS);
        }
    });

    it('has a non-empty name on every record', () => {
        for (const record of plans) {
            expect(record.name, label(record)).not.toBe('');
        }
    });

    it('has a known status on every record', () => {
        for (const record of plans) {
            expect(STATUSES, label(record)).toContain(record.status);
        }
    });

    it('has a prefecture known to cities.json on every record', () => {
        for (const record of plans) {
            expect([...prefs], label(record)).toContain(record.pref);
        }
    });

    // A `city` cities.json cannot resolve costs the record both its coordinate
    // fallback and its order key, while still reading as a correct address.
    // Unlike the prefecture check above, the failure names the offending value
    // instead of listing the haystack, which runs to every municipality in Japan.
    it('has a municipality known to cities.json on every record', () => {
        for (const record of plans) {
            const key = `${record.pref} ${record.city}`;
            expect(municipalities.has(key), `${label(record)} / ${record.city}`).toBe(true);
        }
    });

    it('has string fields typed as strings', () => {
        for (const record of plans) {
            for (const key of ['name', 'pref', 'city', 'status', 'date', 'checked_on']) {
                expect(typeof record[key], `${label(record)} / ${key}`).toBe('string');
            }
        }
    });

    it('has an array of {title, url} string pairs as urls on every record', () => {
        for (const record of plans) {
            expect(Array.isArray(record.urls), label(record)).toBe(true);
            for (const link of record.urls as Record<string, unknown>[]) {
                expect(Object.keys(link), label(record)).toEqual(URL_KEYS);
                expect(typeof link.title, `${label(record)} / title`).toBe('string');
                expect(typeof link.url, `${label(record)} / url`).toBe('string');
            }
        }
    });

    // A record with no source is a claim with nothing behind it: the master
    // exists so that `status` / `date` / `name` can be traced back to a page.
    it('has at least one url on every record', () => {
        for (const record of plans) {
            expect((record.urls as unknown[]).length, label(record)).toBeGreaterThan(0);
        }
    });

    it('has at most ten urls on every record', () => {
        for (const record of plans) {
            expect((record.urls as unknown[]).length, label(record)).toBeLessThanOrEqual(MAX_URLS);
        }
    });

    // The map renders `title` as the link's label, so a blank one would draw an
    // unclickable-looking empty link. Guaranteeing it here means the renderer
    // needs no fallback to the raw url.
    it('has a non-blank title on every url', () => {
        for (const record of plans) {
            for (const link of record.urls as { title: string; url: string }[]) {
                expect(link.title.trim(), `${label(record)} / ${link.url}`).not.toBe('');
            }
        }
    });

    // The info window keys its list by `url`, so a record holding the same
    // source twice would render with duplicate React keys. Two entries for one
    // page is a data error anyway -- the master keeps one link per source.
    it('has no url twice within one record', () => {
        for (const record of plans) {
            const urls = (record.urls as { url: string }[]).map((link) => link.url);
            expect(new Set(urls).size, label(record)).toBe(urls.length);
        }
    });

    // The map puts `url` straight into an href without re-checking its scheme,
    // so the master is where the scheme is fixed.
    it('has only http(s) urls', () => {
        for (const record of plans) {
            for (const link of record.urls as { url: string }[]) {
                expect(/^https?:\/\//i.test(link.url), `${label(record)} / ${link.url}`).toBe(true);
            }
        }
    });

    it('has coordinates that are numbers or null', () => {
        for (const record of plans) {
            for (const key of ['lat', 'lng']) {
                const value = record[key];
                expect(value === null || typeof value === 'number', `${label(record)} / ${key}`).toBe(true);
            }
        }
    });

    it('identifies each record uniquely by name + pref', () => {
        const seen = new Set<string>();
        for (const record of plans) {
            const key = `${record.name} / ${record.pref}`;
            expect(seen.has(key), `duplicate: ${key}`).toBe(false);
            seen.add(key);
        }
    });

    it('is sorted by prefecture, city, then name', () => {
        // The tests above have established that the three ordering columns are
        // strings, so the comparator can be handed the records as typed here.
        const ordered = plans as unknown as PlanRecord[];
        for (let i = 1; i < ordered.length; i++) {
            expect(
                compareRecords(ordered[i - 1], ordered[i]),
                `${label(plans[i - 1])} before ${label(plans[i])}`
            ).toBeLessThanOrEqual(0);
        }
    });
});
