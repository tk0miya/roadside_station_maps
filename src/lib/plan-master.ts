// The development-plan master (`data/plans.json`): reading it, editing one plan,
// and writing it back in its canonical form.
//
// Editing goes through a check-out / check-in pair. `checkOutPlan` removes a plan
// from the master and hands it over; `checkInPlan` stamps it, verifies its key is
// free, and puts it back at its sorted position. Nothing else may enter the
// master, so the stamp and the ordering cannot be skipped.
//
// This is NOT a lock, despite the name. One command is one process, running
// `load` through `savePlans` in a straight line, so no check-out outlives a run
// and no other process sees the gap. Taking the plan out of the collection buys
// something else: `name` and `pref` are editable columns, so a key cannot serve
// as the plan's identity across an edit, and holding the object outside the array
// means nothing has to be re-identified after a rename. It also makes the
// uniqueness check plain -- while a plan is checked out, the master holds exactly
// the other plans.
//
// Validation here is deliberately thin. `src/frontend/plan-data.test.ts` checks
// the whole file in CI, which is stronger than checking one edit at a time; what
// this module adds is refusing those same writes before the pull request rather
// than after, and refusing the ones jq used to accept silently (a key that matches
// nothing, a url that matches nothing). The location rule is the one thing checked
// only here, so a `city` written by hand still reaches the file.

import * as fs from 'node:fs';
import type { City, PlanRecord, PlanUrl } from '../frontend/types/plan.js';
import { STATUSES } from '../frontend/types/plan.js';

// Module-relative so a command works from any directory, like the validator does.
const PLANS_PATH = new URL('../../data/plans.json', import.meta.url);
const CITIES_PATH = new URL('../../data/cities.json', import.meta.url);

export const MAX_URLS = 10;

// The master, plus the city table that decides record order. Always read as a
// pair: placing a plan needs both.
export interface Master {
    plans: PlanRecord[];
    cities: City[];
}

// What a plan is looked up by. `name` is not unique (道の駅 川崎町 exists in both
// 福岡県 and 宮城県), so it only means anything paired with `pref`.
//
// A lookup key, not an identity: both columns are editable, so the key of a plan
// changes the moment it is renamed or moved.
export interface PlanKey {
    name: string;
    pref: string;
}

// The fields `update` and `add` can write. A key left out keeps its value.
// `null` on lat / lng means "no coordinate" (the map falls back to the
// municipality's representative point).
export interface FieldUpdates {
    name?: string;
    pref?: string;
    city?: string;
    status?: string;
    date?: string;
    lat?: number | null;
    lng?: number | null;
}

export interface ListOptions {
    statuses?: string[];
    sort?: 'checked_on';
    limit?: number;
}

// Ordering only reads three columns. Taken structurally rather than as a whole
// PlanRecord so the validator, which holds its records untyped on purpose, can
// use the same comparator.
type OrderKey = Pick<PlanRecord, 'name' | 'pref' | 'city'>;

function label(plan: OrderKey): string {
    return `${plan.name} (${plan.pref})`;
}

function read<T>(path: URL): T {
    return JSON.parse(fs.readFileSync(path, 'utf-8'));
}

export function load(): Master {
    return { plans: read<PlanRecord[]>(PLANS_PATH), cities: read<City[]>(CITIES_PATH) };
}

// The canonical form is four-space pretty JSON with a trailing newline, which is
// byte-for-byte what Biome formats the file to -- so a write shows up in the diff
// as the edited record and nothing else. Written straight, with no temporary
// file: unlike a shell redirection, this cannot truncate the file it is reading.
//
// Takes the array rather than the Master so there is no path through which this
// tool could write data/cities.json.
export function savePlans(plans: PlanRecord[]): void {
    fs.writeFileSync(PLANS_PATH, `${JSON.stringify(plans, null, 4)}\n`, 'utf-8');
}

// Today in Japan. The master records Japanese days, so the machine running a
// command -- often on UTC -- does not get to decide which day it is. en-CA is the
// locale that formats a date as yyyy-mm-dd, the form the column holds.
function todayInJapan(): string {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
}

function compareStrings(a: string, b: string): number {
    if (a < b) {
        return -1;
    }
    return a > b ? 1 : 0;
}

// The documented record order: pref, then city, then name.
//
// One comparator serves both directions: the validator checks the file is in this
// order, and checkInPlan puts a plan where this order says it belongs.
//
// A city the table does not know sorts to the end of its prefecture. checkInPlan
// refuses to write one, so this is a fallback rather than a rule: a value typed
// into GitHub's editor never passes through the CLI, and an undefined order would
// be worse than a defined one nobody aims for.
export function createPlanComparator(cities: City[]): (a: OrderKey, b: OrderKey) => number {
    // Order keys by first appearance in cities.json (全国地方公共団体コード順).
    const prefOrder = new Map<string, number>();
    const cityOrder = new Map<string, number>();
    for (const city of cities) {
        if (!prefOrder.has(city.pref)) {
            prefOrder.set(city.pref, prefOrder.size);
        }
        const key = `${city.pref} ${city.city}`;
        if (!cityOrder.has(key)) {
            cityOrder.set(key, cityOrder.size);
        }
    }

    const LAST = Number.MAX_SAFE_INTEGER;

    return (a, b) => {
        const prefs = [prefOrder.get(a.pref) ?? LAST, prefOrder.get(b.pref) ?? LAST];
        if (prefs[0] !== prefs[1]) {
            return prefs[0] - prefs[1];
        }
        const keys = [cityOrder.get(`${a.pref} ${a.city}`) ?? LAST, cityOrder.get(`${b.pref} ${b.city}`) ?? LAST];
        if (keys[0] !== keys[1]) {
            return keys[0] - keys[1];
        }
        if (keys[0] === LAST && a.city !== b.city) {
            return compareStrings(a.city, b.city);
        }
        return compareStrings(a.name, b.name);
    };
}

function matchingIndexes(plans: PlanRecord[], key: PlanKey): number[] {
    const indexes: number[] = [];
    plans.forEach((plan, index) => {
        if (plan.name === key.name && plan.pref === key.pref) {
            indexes.push(index);
        }
    });
    return indexes;
}

// The one plan a key selects. A key that selects nothing is the failure jq used
// to hide: `select` matching no record succeeds and prints the file unchanged, so
// a write that did nothing looked like a write that worked.
function onlyIndex(plans: PlanRecord[], key: PlanKey): number {
    const indexes = matchingIndexes(plans, key);

    if (indexes.length === 0) {
        throw new Error(
            `No plan named ${key.name} in ${key.pref}. Check the name against the master -- a renamed plan is ` +
                'no longer under its old name.'
        );
    }
    if (indexes.length > 1) {
        throw new Error(`${indexes.length} plans named ${key.name} in ${key.pref}. The master should hold one.`);
    }

    return indexes[0];
}

// Look at one plan without checking it out: no reordering, no stamp.
export function findPlan(plans: PlanRecord[], key: PlanKey): PlanRecord {
    return plans[onlyIndex(plans, key)];
}

// Borrow one plan for editing, removing it from the master. Not a lock -- see the
// note at the top of this file.
export function checkOutPlan(master: Master, key: PlanKey): PlanRecord {
    const [plan] = master.plans.splice(onlyIndex(master.plans, key), 1);
    return plan;
}

// The only way into the master. Stamps `checked_on`, refuses a key that is
// already taken, and inserts the plan where the record order puts it.
//
// `checked_on` is stamped here rather than passed in: this is the only way into
// the master, so doing it unconditionally is enough to make it unskippable.
//
// A rename and a brand-new record collide with an existing plan the same way, so
// both land on the one check below. The master is sorted (CI enforces it), so a
// linear scan finds the insertion point.
export function checkInPlan(master: Master, plan: PlanRecord): void {
    if (matchingIndexes(master.plans, plan).length > 0) {
        throw new Error(`${label(plan)} is already in the master. A plan is identified by name + pref.`);
    }
    // The location has to name a municipality the city table knows
    // (docs/plan-map.md). An empty city fails this too, by not matching anything.
    // Reported per column because the fixes differ, which is why these are two
    // checks rather than one lookup of the pair.
    if (!master.cities.some((city) => city.pref === plan.pref)) {
        throw new Error(`Unknown prefecture: ${plan.pref}. It must appear in data/cities.json.`);
    }
    if (!master.cities.some((city) => city.pref === plan.pref && city.city === plan.city)) {
        throw new Error(
            `Unknown municipality: ${plan.city} in ${plan.pref}. Write the name data/cities.json carries: check ` +
                'for a missing 郡, the ward of a designated city, or a rename that file has not caught up with.'
        );
    }

    plan.checked_on = todayInJapan();

    const compare = createPlanComparator(master.cities);
    const index = master.plans.findIndex((other) => compare(plan, other) < 0);
    master.plans.splice(index === -1 ? master.plans.length : index, 0, plan);
}

function validateFields(updates: FieldUpdates): void {
    // `name` is half of how a plan is identified, so unlike the other columns it
    // cannot be emptied.
    if (updates.name !== undefined && updates.name.trim() === '') {
        throw new Error('Invalid name: it must not be empty.');
    }

    if (updates.status !== undefined && !(STATUSES as string[]).includes(updates.status)) {
        throw new Error(`Invalid status: ${updates.status}. Valid values: ${STATUSES.join(', ')}`);
    }

    // `date` is deliberately unchecked: the master records whatever precision is
    // known, which may be a full date, a month, a year, a fiscal year, or a
    // season (2026夏). No single pattern covers that.

    // Finite, not merely not-NaN: JSON.stringify renders Infinity as null, so an
    // overflowing coordinate would be written as "no coordinate" instead of being
    // refused. Whether the value is a plausible coordinate for Japan is not
    // checked -- that is a judgement about the data, which CI makes over the whole
    // file rather than one edit at a time.
    for (const field of ['lat', 'lng'] as const) {
        const value = updates[field];
        if (value !== undefined && value !== null && !Number.isFinite(value)) {
            throw new Error(`Invalid ${field}: expected a finite number, or null to clear it.`);
        }
    }
}

// Write the given fields onto a checked-out plan. Assigning to keys that already
// exist leaves the key order alone, the same property jq's `|=` had.
//
// Takes no array: uniqueness is checkInPlan's to judge, because that is where the
// master holds exactly the other plans.
export function applyUpdates(plan: PlanRecord, updates: FieldUpdates): void {
    validateFields(updates);

    if (updates.name !== undefined) {
        plan.name = updates.name;
    }
    if (updates.pref !== undefined) {
        plan.pref = updates.pref;
    }
    if (updates.city !== undefined) {
        plan.city = updates.city;
    }
    if (updates.status !== undefined) {
        plan.status = updates.status;
    }
    if (updates.date !== undefined) {
        plan.date = updates.date;
    }
    if (updates.lat !== undefined) {
        plan.lat = updates.lat;
    }
    if (updates.lng !== undefined) {
        plan.lng = updates.lng;
    }
}

// A source is rejected for what CI would reject it for, plus the scheme the map
// puts straight into an href. `replacing` is the url being written over, which is
// allowed to equal the incoming one (that is how a title-only fix is expressed).
function validateLink(plan: PlanRecord, link: PlanUrl, replacing?: string): void {
    if (link.title.trim() === '') {
        throw new Error(
            `Invalid title for ${link.url}: the map renders it as the link's label, so it must not be blank.`
        );
    }
    if (!/^https?:\/\//i.test(link.url)) {
        throw new Error(`Invalid url: ${link.url}. Expected an http or https url.`);
    }
    if (plan.urls.some((other) => other.url === link.url && other.url !== replacing)) {
        throw new Error(`${label(plan)} already cites ${link.url}.`);
    }
}

// The url a source operation acts on, matched exactly. jq matched the same way
// but succeeded when nothing matched, which is how a one-character difference in
// a long query string turned into a write that quietly did nothing.
function indexOfUrl(plan: PlanRecord, url: string): number {
    const index = plan.urls.findIndex((link) => link.url === url);
    if (index === -1) {
        throw new Error(`${label(plan)} does not cite ${url}. Copy the url from what show prints.`);
    }
    return index;
}

export function addUrl(plan: PlanRecord, link: PlanUrl): void {
    validateLink(plan, link);
    if (plan.urls.length >= MAX_URLS) {
        throw new Error(
            `${label(plan)} already holds ${MAX_URLS} urls. Swap one out with url replace rather than adding.`
        );
    }
    plan.urls.push(link);
}

// Swap one source for another in place. Kept as its own operation because
// remove-then-add does not compose cleanly: on a plan with one url the removal is
// blocked, and on a plan with ten the addition is, so the correct order would
// flip with how full the record is.
export function replaceUrl(plan: PlanRecord, deadUrl: string, link: PlanUrl): void {
    const index = indexOfUrl(plan, deadUrl);
    validateLink(plan, link, deadUrl);
    plan.urls[index] = link;
}

export function removeUrl(plan: PlanRecord, deadUrl: string): void {
    const index = indexOfUrl(plan, deadUrl);
    // A record with no source is a claim with nothing behind it. A dead link that
    // has no replacement is better kept (the Web Archive may still have it) and
    // raised in docs/plan-reports.md.
    if (plan.urls.length === 1) {
        throw new Error(
            `${label(plan)} cites only ${deadUrl}. Removing it would leave the plan with no source -- keep it and ` +
                'raise it in docs/plan-reports.md, or replace it with url replace.'
        );
    }
    plan.urls.splice(index, 1);
}

export function setUrlTitle(plan: PlanRecord, url: string, title: string): void {
    const index = indexOfUrl(plan, url);
    validateLink(plan, { title, url }, url);
    plan.urls[index].title = title;
}

// A new record, with its nine keys in the fixed order. One source is required:
// the master does not hold a plan with nothing behind it. `checked_on` is left
// empty for checkInPlan to stamp.
export function createPlan(fields: FieldUpdates, link: PlanUrl): PlanRecord {
    const { name, pref, city, status } = fields;
    if (!name || !pref || !city || !status) {
        throw new Error('A new plan needs a name, a prefecture, a city and a status.');
    }
    validateFields(fields);

    const plan: PlanRecord = {
        name,
        pref,
        city,
        status,
        date: fields.date ?? '',
        lat: fields.lat ?? null,
        lng: fields.lng ?? null,
        urls: [],
        checked_on: '',
    };

    addUrl(plan, link);
    return plan;
}

// A view over the master: filter, order, count. No aggregation -- pipe the JSON
// through jq for that.
export function listPlans(plans: PlanRecord[], options: ListOptions): PlanRecord[] {
    let selected = plans;

    const statuses = options.statuses;
    if (statuses !== undefined) {
        for (const status of statuses) {
            if (!(STATUSES as string[]).includes(status)) {
                throw new Error(`Invalid status: ${status}. Valid values: ${STATUSES.join(', ')}`);
            }
        }
        selected = selected.filter((plan) => statuses.includes(plan.status));
    }

    if (options.sort === 'checked_on') {
        // A stable sort, so plans stamped on the same day stay in file order --
        // which is prefecture order, making the result reproducible.
        selected = [...selected].sort((a, b) => compareStrings(a.checked_on, b.checked_on));
    }

    return options.limit === undefined ? selected : selected.slice(0, options.limit);
}
