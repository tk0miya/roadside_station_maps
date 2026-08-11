// Validator for the development-plan master (`data/plans.json`).
//
// Reads the real file, so that however the edit was made -- `plan.ts`, or a
// human in GitHub's editor -- a broken one fails `npm run ci` on the pull
// request before it can be merged.
//
// Most rules are checked here and again by `plan.ts` before it writes, which
// only costs a clearer error message. The count of `urls` is the exception:
// `plan.ts` deliberately leaves it alone (its header says why), so this is the
// only place it is enforced.
//
// Formatting (indent, key spacing) is deliberately NOT checked -- Biome owns
// that. Neither is a byte-for-byte match against a re-serialization, because
// number rendering varies by writer (36 vs 36.0) and would fail for reasons
// nobody could act on. The split is: Biome formats, this test validates
// structure.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// The record order is defined in plan-record-order.ts, which says why it lives
// there rather than here.
import { createPlanRecordComparator, knownPrefectures, type PlanRecordOrderKey } from '../lib/plan-record-order';
// The status vocabulary is defined once, where the map narrows it. Importing it
// rather than restating it means adding a Status also allows it in the data --
// otherwise the type would accept a value the master could not hold, and the
// mismatch would surface as a CI failure with no obvious cause.
import { STATUSES } from './types/plan';

// Not derivable from a type at runtime, so this one is spelled out.
const KEYS = ['name', 'pref', 'city', 'status', 'date', 'lat', 'lng', 'urls', 'checked_on'];
const URL_KEYS = ['title', 'url'];

interface City {
    pref: string;
    city: string;
}

function read<T>(path: string): T {
    return JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));
}

const plans = read<Record<string, unknown>[]>('data/plans.json');
const cities = read<City[]>('data/cities.json');

const compareRecords = createPlanRecordComparator(cities);
const prefectures = knownPrefectures(cities);

// The records are read untyped so a malformed field fails its own assertion
// rather than the file's parse; the comparator needs the three ordering fields.
function orderKey(record: Record<string, unknown>): PlanRecordOrderKey {
    return record as unknown as PlanRecordOrderKey;
}

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
            expect(prefectures, label(record)).toContain(record.pref);
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

    // Why the column has a ceiling at all is in CLAUDE.md (開発計画マスタ).
    it('has at most ten urls on every record', () => {
        for (const record of plans) {
            expect((record.urls as unknown[]).length, label(record)).toBeLessThanOrEqual(10);
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
        for (let i = 1; i < plans.length; i++) {
            expect(
                compareRecords(orderKey(plans[i - 1]), orderKey(plans[i])),
                `${label(plans[i - 1])} before ${label(plans[i])}`
            ).toBeLessThanOrEqual(0);
        }
    });
});
