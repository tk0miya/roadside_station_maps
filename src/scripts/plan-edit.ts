// Writer for the development-plan master (`data/plans.json`).
//
// The research skill edits the master one station at a time, and used to do it
// with jq. jq reads the file well, but three of the skill's rules could only be
// followed by remembering them:
//
//   - a `select` (or a `.url ==` match) that hits nothing still exits 0 and
//     rewrites the file unchanged, so a mistyped key looks exactly like a
//     successful edit
//   - `checked_on` is deliberately not enforced by CI (see CLAUDE.md), and a
//     station that misses its stamp is handed out by the queue again
//   - a new record's position needs `data/cities.json`, which jq cannot reach
//     from the expression, so records were appended and moved by hand
//
// This CLI makes the first two structural -- every operation matches exactly
// one record or exits non-zero, and every write stamps `checked_on` -- and does
// the third itself.
//
// It deliberately does not read. Listing the queue, counting what is left and
// dumping a record stay jq's job: those queries change shape every time, and a
// fixed set of subcommands would only cover some of them.
//
// The checks below restate rules `src/frontend/plan-data.test.ts` also owns,
// and that duplication is deliberate: the check there is what guards the file
// however it was edited, while these exist to fail *before* the write, with a
// message naming the station. Changing a rule means changing both.

import * as fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { type City, type PlanRecord, type PlanUrl, STATUSES } from '../frontend/types/plan.js';
import { createPlanRecordComparator, knownPrefectures } from '../lib/plan-record-order.js';

const PLANS_FILENAME = 'data/plans.json';
const CITIES_FILENAME = 'data/cities.json';

// The scalar keys in record order, for the change summary. Not the record's key
// order -- `urls` sits between `lng` and `checked_on` and is diffed separately.
const SCALAR_KEYS = ['name', 'pref', 'city', 'status', 'date', 'lat', 'lng', 'checked_on'] as const;

export function label(record: { name: string; pref: string }): string {
    return `${record.name} (${record.pref})`;
}

// The stamp is the queue's sort key, so it has to be the date in Japan
// regardless of where this runs -- a UTC machine would write yesterday all
// morning and hand the same station out again.
export function todayInJst(now: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(now);
}

// The ceiling the master keeps on sources; why it exists is in CLAUDE.md.
const MAX_URLS = 10;

function assertLink(link: PlanUrl): void {
    if (!/^https?:\/\//i.test(link.url)) {
        throw new Error(`not an http(s) url: ${link.url}`);
    }
    // The map draws `title` as the link's label, so a blank one renders as a
    // link with nothing to click.
    if (link.title.trim() === '') {
        throw new Error(`no title for ${link.url}; the map uses it as the link's label`);
    }
}

// Locates the one record an operation applies to. Anything other than a single
// hit is an error: zero means the key is wrong (a renamed station is still
// filed under its old name), and more than one should be impossible.
export function findRecord(records: PlanRecord[], name: string, pref: string): number {
    const found = records.flatMap((record, index) => (record.name === name && record.pref === pref ? [index] : []));
    if (found.length === 0) {
        throw new Error(
            `no record matches ${name} (${pref}); check the name and prefecture against the master ` +
                '-- a station renamed in an earlier session is still filed under its old name'
        );
    }
    if (found.length > 1) {
        throw new Error(`${found.length} records match ${name} (${pref}); the master must identify a station uniquely`);
    }
    return found[0];
}

export interface FieldPatch {
    name?: string;
    pref?: string;
    city?: string;
    status?: string;
    date?: string;
    lat?: number | null;
    lng?: number | null;
}

// Spreading keeps the key order: every key already exists, and overwriting one
// leaves it in place.
export function setFields(record: PlanRecord, patch: FieldPatch, today: string): PlanRecord {
    if (patch.status !== undefined && !(STATUSES as string[]).includes(patch.status)) {
        throw new Error(`unknown status ${patch.status}; expected one of ${STATUSES.join(' / ')}`);
    }
    if (patch.name === '') {
        throw new Error('a record cannot be renamed to an empty name');
    }
    return { ...record, ...patch, checked_on: today };
}

export function addUrl(record: PlanRecord, link: PlanUrl, today: string): PlanRecord {
    assertLink(link);
    if (record.urls.some((existing) => existing.url === link.url)) {
        throw new Error(`${label(record)} already cites ${link.url}`);
    }
    // Which of the ten to drop is a judgement the skill makes, not this tool --
    // so the ceiling is refused rather than enforced by evicting something.
    if (record.urls.length >= MAX_URLS) {
        throw new Error(
            `${label(record)} already cites ${MAX_URLS} sources; swap the weakest one out with url-set ` +
                'instead of adding an eleventh'
        );
    }
    return { ...record, urls: [...record.urls, { title: link.title, url: link.url }], checked_on: today };
}

// Covers both replacing a dead source with its successor (`to`) and copying a
// page's heading onto a link whose title is still its url (`title`).
export function updateUrl(
    record: PlanRecord,
    target: string,
    patch: { title?: string; to?: string },
    today: string
): PlanRecord {
    requireCitedUrl(record, target);
    if (patch.to !== undefined && patch.to !== target && record.urls.some((link) => link.url === patch.to)) {
        throw new Error(`${label(record)} already cites ${patch.to}`);
    }
    const urls = record.urls.map((link) =>
        link.url === target ? { title: patch.title ?? link.title, url: patch.to ?? link.url } : link
    );
    // Checked on the result rather than the patch, so a swap that keeps the
    // old title is held to the same rules as one that replaces it.
    for (const link of urls) {
        assertLink(link);
    }
    return { ...record, urls, checked_on: today };
}

export function removeUrl(record: PlanRecord, target: string, today: string): PlanRecord {
    requireCitedUrl(record, target);
    // The zero-source guard from the skill: a record with no source left states
    // a date and a status nothing backs. An unreachable url can still be pulled
    // out of a web archive, so it is the better of the two.
    if (record.urls.length === 1) {
        throw new Error(
            `removing ${target} would leave ${label(record)} with no source; keep it and ` +
                'note the dead link in docs/plan-reports.md'
        );
    }
    return { ...record, urls: record.urls.filter((link) => link.url !== target), checked_on: today };
}

// The match is exact, so a url retyped instead of copied silently hits nothing
// -- the same failure as a mistyped station name, and worth the same error.
function requireCitedUrl(record: PlanRecord, target: string): void {
    if (!record.urls.some((link) => link.url === target)) {
        throw new Error(
            `${label(record)} cites no source with url ${target}; copy the url from the record ` +
                '(the match is exact, and query strings make near-misses easy)'
        );
    }
}

export function buildRecord(fields: {
    name: string;
    pref: string;
    city: string;
    status: string;
    date: string;
    lat: number | null;
    lng: number | null;
    urls: PlanUrl[];
    checked_on: string;
}): PlanRecord {
    if (fields.name === '') {
        throw new Error('a new record needs a name');
    }
    if (!(STATUSES as string[]).includes(fields.status)) {
        throw new Error(`unknown status ${fields.status}; expected one of ${STATUSES.join(' / ')}`);
    }
    if (fields.urls.length === 0) {
        throw new Error('a new record needs at least one source; the master does not hold unsourced stations');
    }
    if (fields.urls.length > MAX_URLS) {
        throw new Error(`a record holds at most ${MAX_URLS} sources`);
    }
    for (const link of fields.urls) {
        assertLink(link);
    }
    // Spelled out rather than spread so the key order is set here, where the
    // record is created, instead of depending on the caller's literal.
    return {
        name: fields.name,
        pref: fields.pref,
        city: fields.city,
        status: fields.status,
        date: fields.date,
        lat: fields.lat,
        lng: fields.lng,
        urls: fields.urls.map((link) => ({ title: link.title, url: link.url })),
        checked_on: fields.checked_on,
    };
}

// Places the record where the file's order says it belongs, which is the part
// jq could not do: the ranking comes from cities.json, not from the record.
export function insertRecord(records: PlanRecord[], record: PlanRecord, cities: City[]): PlanRecord[] {
    if (records.some((existing) => existing.name === record.name && existing.pref === record.pref)) {
        throw new Error(`${label(record)} is already in the master`);
    }
    if (!knownPrefectures(cities).includes(record.pref)) {
        throw new Error(`unknown prefecture ${record.pref}; it has to match data/cities.json`);
    }
    const compare = createPlanRecordComparator(cities);
    const at = records.findIndex((existing) => compare(record, existing) < 0);
    const index = at === -1 ? records.length : at;
    return [...records.slice(0, index), record, ...records.slice(index)];
}

// Whether an edit changed where the record belongs in the file. All three
// ordering keys are editable, and a city corrected to the cities.json spelling
// moves the record out of the tail its unknown spelling had put it in, so any
// of them has to re-place it.
export function movesRecord(before: PlanRecord, after: PlanRecord): boolean {
    return after.name !== before.name || after.pref !== before.pref || after.city !== before.city;
}

// Puts an edited record back, at a new position when the edit moved it. This is
// the only path that changes the shape of the array, and a record dropped here
// would pass every check in plan-data.test.ts -- a station simply missing from
// the master breaks no rule -- so it is worth having on its own.
export function replaceRecord(records: PlanRecord[], index: number, after: PlanRecord, cities: City[]): PlanRecord[] {
    const updated = [...records];
    updated[index] = after;
    if (!movesRecord(records[index], after)) {
        return updated;
    }
    // Removed before being placed, so `insertRecord`'s duplicate check does not
    // see the record collide with the copy of itself it is replacing.
    return insertRecord(updated.toSpliced(index, 1), after, cities);
}

// A record with neither coordinates nor a city the table knows is not drawn at
// all. Worth saying out loud, but not worth refusing: the city may simply be
// spelled the way its own municipality spells it, and a human can fix it.
export function coordinateWarning(record: PlanRecord, cities: City[]): string | null {
    if (record.lat !== null && record.lng !== null) {
        return null;
    }
    if (cities.some((city) => city.pref === record.pref && city.city === record.city)) {
        return null;
    }
    return (
        `${label(record)} has no coordinates and its city (${record.city}) is not in data/cities.json, ` +
        `so the map cannot place it; set --lat/--lng or match the city table's spelling`
    );
}

// Every field of a new record. `describeChange` would show none of them -- a
// new record has no previous value to differ from -- and the added station is
// exactly where the values are worth reading back.
export function describeRecord(record: PlanRecord): string[] {
    const lines = SCALAR_KEYS.map((key) => `  ${key.padEnd(10)} ${JSON.stringify(record[key])}`);
    return [...lines, ...record.urls.map((link) => `  + ${link.title}  ${link.url}`)];
}

// What changed, so the edit can be checked without reading the whole record.
// It does not replace `git diff data/plans.json` -- that is what shows the
// change in the form the pull request will carry it.
export function describeChange(before: PlanRecord, after: PlanRecord): string[] {
    const lines: string[] = [];
    for (const key of SCALAR_KEYS) {
        if (before[key] !== after[key]) {
            lines.push(`  ${key.padEnd(10)} ${JSON.stringify(before[key])} -> ${JSON.stringify(after[key])}`);
        }
    }
    const seen = new Map(before.urls.map((link) => [link.url, link.title]));
    for (const link of after.urls) {
        if (!seen.has(link.url)) {
            lines.push(`  + ${link.title}  ${link.url}`);
        } else if (seen.get(link.url) !== link.title) {
            lines.push(`  ~ ${link.title}  ${link.url}`);
        }
    }
    const kept = new Set(after.urls.map((link) => link.url));
    for (const link of before.urls) {
        if (!kept.has(link.url)) {
            lines.push(`  - ${link.title}  ${link.url}`);
        }
    }
    return lines;
}

type Flags = Record<string, string>;

// Unknown flags are rejected rather than ignored: a typo in `--status` would
// otherwise leave a command that runs, stamps `checked_on` and changes nothing
// else -- the silent no-op this tool exists to remove.
export function parseFlags(argv: string[], allowed: string[]): Flags {
    const flags: Flags = {};
    for (let i = 0; i < argv.length; i += 2) {
        const flag = argv[i];
        if (!flag.startsWith('--')) {
            throw new Error(`expected a --flag, got ${flag}`);
        }
        const name = flag.slice(2);
        if (!allowed.includes(name)) {
            throw new Error(
                `unknown flag ${flag} here; this subcommand takes ${allowed.map((f) => `--${f}`).join(' ')}`
            );
        }
        if (name in flags) {
            throw new Error(`${flag} given twice`);
        }
        if (i + 1 >= argv.length) {
            throw new Error(`${flag} needs a value`);
        }
        flags[name] = argv[i + 1];
    }
    return flags;
}

function requireFlags(flags: Flags, ...names: string[]): void {
    const missing = names.filter((name) => !(name in flags));
    if (missing.length > 0) {
        throw new Error(`missing ${missing.map((name) => `--${name}`).join(' ')}`);
    }
}

// The literal `null` clears a coordinate; anything else has to be written out
// as a decimal number. Matching the shape rather than deferring to `Number()`
// is what rejects the empty string, which `Number('')` reads as 0 -- a station
// dropped into the Gulf of Guinea, and a value both CI and the map accept.
export function parseCoordinate(value: string): number | null {
    if (value === 'null') {
        return null;
    }
    if (!/^-?\d+(\.\d+)?$/.test(value)) {
        throw new Error(`not a coordinate: ${JSON.stringify(value)}; write a decimal number, or null to clear it`);
    }
    return Number(value);
}

// Every station in the master is in Japan, so a coordinate outside it is a
// mistake rather than a location -- and the one that actually happens is `lat`
// and `lng` swapped, which passes every other check here (two numbers, both
// set) and every check in plan-data.test.ts (typed as numbers).
const BOUNDS = { lat: [20, 46], lng: [122, 154] } as const;

function assertInJapan(axis: 'lat' | 'lng', value: number): void {
    const [low, high] = BOUNDS[axis];
    if (value < low || value > high) {
        throw new Error(`${axis} ${value} is outside Japan (${low}..${high}); are --lat and --lng swapped?`);
    }
}

// Half a coordinate is not a partial update, it is a wrong one: the map places
// a station only when both are set and falls back to the city point otherwise,
// so the pair moves together -- both given, and both the same kind of value.
export function coordinatePatch(flags: Flags): FieldPatch {
    if ('lat' in flags !== 'lng' in flags) {
        throw new Error('--lat and --lng go together');
    }
    if (!('lat' in flags)) {
        return {};
    }
    const lat = parseCoordinate(flags.lat);
    const lng = parseCoordinate(flags.lng);
    if ((lat === null) !== (lng === null)) {
        throw new Error('--lat and --lng have to be both null or both numbers');
    }
    if (lat !== null && lng !== null) {
        assertInJapan('lat', lat);
        assertInJapan('lng', lng);
    }
    return { lat, lng };
}

function readJson<T>(filename: string): T {
    return JSON.parse(fs.readFileSync(filename, 'utf-8')) as T;
}

// Written next to the target and renamed over it, so an interrupted write
// cannot leave the master truncated. 4-space indent matches what Biome
// normalizes to, keeping `npm run lint` a no-op on the result.
function writePlans(records: PlanRecord[]): void {
    const temporary = `${PLANS_FILENAME}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(records, null, 4)}\n`);
    fs.renameSync(temporary, PLANS_FILENAME);
}

const USAGE = `usage: npm run plan:edit -- <subcommand> [flags]

  set      --name N --pref P [--status S] [--date D] [--city C]
           [--new-name N] [--new-pref P] [--lat X --lng Y]   (--lat null --lng null clears them)
  touch    --name N --pref P
  url-add  --name N --pref P --title T --url U
  url-set  --name N --pref P --url U [--title T] [--to NEW-URL]
  url-rm   --name N --pref P --url U
  add      --name N --pref P --city C --status S --title T --url U [--date D] [--lat X --lng Y]

Every subcommand stamps checked_on with today's date in JST.
Reading the master (the queue, a record's sources) stays jq's job.`;

const SELECTORS = ['name', 'pref'];

function run(argv: string[]): void {
    const [subcommand, ...rest] = argv;
    const today = todayInJst(new Date());
    const records = readJson<PlanRecord[]>(PLANS_FILENAME);
    const cities = readJson<City[]>(CITIES_FILENAME);

    if (subcommand === 'add') {
        const flags = parseFlags(rest, [...SELECTORS, 'city', 'status', 'date', 'lat', 'lng', 'title', 'url']);
        requireFlags(flags, 'name', 'pref', 'city', 'status', 'title', 'url');
        const coordinates = coordinatePatch(flags);
        const record = buildRecord({
            name: flags.name,
            pref: flags.pref,
            city: flags.city,
            status: flags.status,
            date: flags.date ?? '',
            lat: coordinates.lat ?? null,
            lng: coordinates.lng ?? null,
            urls: [{ title: flags.title, url: flags.url }],
            checked_on: today,
        });
        const inserted = insertRecord(records, record, cities);
        writePlans(inserted);
        console.log(`added ${label(record)} at record ${inserted.indexOf(record) + 1} of ${inserted.length}`);
        for (const line of describeRecord(record)) {
            console.log(line);
        }
        const warning = coordinateWarning(record, cities);
        if (warning) {
            console.warn(`warning: ${warning}`);
        }
        return;
    }

    const flagsBySubcommand: Record<string, string[]> = {
        set: [...SELECTORS, 'status', 'date', 'city', 'new-name', 'new-pref', 'lat', 'lng'],
        touch: SELECTORS,
        'url-add': [...SELECTORS, 'title', 'url'],
        'url-set': [...SELECTORS, 'url', 'title', 'to'],
        'url-rm': [...SELECTORS, 'url'],
    };
    const allowed = flagsBySubcommand[subcommand];
    if (!allowed) {
        throw new Error(`unknown subcommand ${subcommand ?? '(none)'}\n\n${USAGE}`);
    }
    const flags = parseFlags(rest, allowed);
    requireFlags(flags, ...SELECTORS);

    const index = findRecord(records, flags.name, flags.pref);
    const before = records[index];
    let after: PlanRecord;

    switch (subcommand) {
        case 'touch':
            after = setFields(before, {}, today);
            break;
        case 'set': {
            const patch: FieldPatch = coordinatePatch(flags);
            for (const key of ['status', 'date', 'city'] as const) {
                if (key in flags) {
                    patch[key] = flags[key];
                }
            }
            // A name already taken in the target prefecture is caught when the
            // record is placed below, which is also where the record it would
            // collide with is still in the list to compare against.
            if ('new-name' in flags) {
                patch.name = flags['new-name'];
            }
            if ('new-pref' in flags) {
                patch.pref = flags['new-pref'];
            }
            after = setFields(before, patch, today);
            break;
        }
        case 'url-add':
            requireFlags(flags, 'title', 'url');
            after = addUrl(before, { title: flags.title, url: flags.url }, today);
            break;
        case 'url-set':
            requireFlags(flags, 'url');
            if (!('title' in flags) && !('to' in flags)) {
                throw new Error('url-set needs --title or --to');
            }
            after = updateUrl(before, flags.url, { title: flags.title, to: flags.to }, today);
            break;
        case 'url-rm':
            requireFlags(flags, 'url');
            after = removeUrl(before, flags.url, today);
            break;
        default:
            throw new Error(`unknown subcommand ${subcommand}`);
    }

    const changes = describeChange(before, after);
    writePlans(replaceRecord(records, index, after, cities));

    console.log(label(after));
    // Said out loud rather than printed as nothing: an edit that moved no field
    // (the same value set twice, a second touch on one day) would otherwise look
    // like the silent no-op this tool exists to rule out.
    for (const line of changes.length > 0 ? changes : ['  no change']) {
        console.log(line);
    }
    const warning = coordinateWarning(after, cities);
    if (warning) {
        console.warn(`warning: ${warning}`);
    }
}

// Only run when invoked as a script, so the tests can import the transforms
// without the CLI reading the master and parsing vitest's own arguments.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        run(process.argv.slice(2));
    } catch (error) {
        console.error(`plan-edit: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    }
}
