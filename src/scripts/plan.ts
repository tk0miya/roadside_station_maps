// Reader and writer for the development-plan master (`data/plans.json`).
//
// One module behind seven npm scripts (`plan:list`, `plan:show`, `plan:edit`,
// `plan:touch`, `plan:add`, `plan:url:add`, `plan:url:rm`); each passes its verb
// as the first argument, so a caller types a command name rather than a
// subcommand. Every verb but `plan:list` takes the station as two positional
// arguments -- the name and prefecture it is filed under today -- and every
// option carries a new value for the field it names.
//
// Two properties hold for every write: it resolves exactly one record or exits
// non-zero, and it stamps `checked_on`. The stamp is not a field any verb
// accepts -- it follows from writing rather than being decided, which is what
// keeps the research queue moving without CI having to enforce it (CLAUDE.md
// says why it does not).
//
// What it does not check is how many sources a record ends up with. A record
// holds one to ten, and a source is replaced by removing it before adding its
// successor -- so a record legitimately passes through zero mid-edit, and
// enforcing the range on every write would block the replacement. The count is
// left to the writer and verified once, by `src/frontend/plan-data.test.ts`,
// on the finished file.

import * as fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { type City, type PlanRecord, type PlanUrl, STATUSES } from '../frontend/types/plan.js';
import { createPlanRecordComparator, knownPrefectures } from '../lib/plan-record-order.js';

const PLANS_FILENAME = 'data/plans.json';
const CITIES_FILENAME = 'data/cities.json';

// The statuses a station can still move away from, and so the ones worth
// re-checking. 開業 and 中止 are finished stories. 凍結 is not (see `Status`), and
// research is the only thing that would notice a plan resuming, so dropping it
// from the queue would remove the only path by which it ever comes back.
const QUEUED = ['登録済み', '計画中', '凍結'];
const QUEUE_PAGE = 10;

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

// Locates the one record a command applies to. Anything other than a single hit
// is an error: zero means the key is wrong (a renamed station is still filed
// under its old name), and more than one should be impossible.
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
    return { ...record, urls: [...record.urls, { title: link.title, url: link.url }], checked_on: today };
}

// The match is exact, so a url retyped instead of copied hits nothing -- the
// same failure as a mistyped station name, and worth the same error. Emptying
// the list is allowed: a source is replaced by removing it and adding its
// successor, and the count is checked on the finished file.
export function removeUrl(record: PlanRecord, target: string, today: string): PlanRecord {
    if (!record.urls.some((link) => link.url === target)) {
        throw new Error(
            `${label(record)} cites no source with url ${target}; copy the url from plan:show ` +
                '(the match is exact, and query strings make near-misses easy)'
        );
    }
    return { ...record, urls: record.urls.filter((link) => link.url !== target), checked_on: today };
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

// The one way the array changes: put the record in, then restore the file's
// order. `index` is -1 for a record that does not exist yet, which is the only
// respect in which adding differs from editing.
//
// Sorting the whole array rather than searching for an insertion point is what
// keeps this short. The master is sorted and stays sorted, so a record whose
// `pref` / `city` / `name` did not move sorts back to where it was.
export function placeRecord(records: PlanRecord[], index: number, record: PlanRecord, cities: City[]): PlanRecord[] {
    if (!knownPrefectures(cities).includes(record.pref)) {
        throw new Error(`unknown prefecture ${record.pref}; it has to match data/cities.json`);
    }
    const updated = index === -1 ? [...records, record] : records.with(index, record);
    // Counted over the result, so a record does not collide with the copy of
    // itself it is replacing -- while a rename onto a name the prefecture
    // already holds still does.
    if (updated.filter((held) => held.name === record.name && held.pref === record.pref).length > 1) {
        throw new Error(`${label(record)} is already in the master`);
    }
    return updated.toSorted(createPlanRecordComparator(cities));
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

// A record as the master holds it, rendered with the indent `writePlans` uses
// so that what a command prints and what lands in the file cannot drift apart.
// It is the whole record rather than a summary of the edit: `git diff` already
// answers "what changed", in the form the pull request will carry.
export function describeRecord(record: PlanRecord): string {
    return JSON.stringify(record, null, 4);
}

// The oldest page of the queue, plus how big the queue is. The totals matter
// as much as the page: one session clears ten, so they are how the skill
// reports whether another session is worth running.
export function describeQueue(records: PlanRecord[], page: number): string {
    // Sorted by stamp alone, and stably, so records sharing a stamp keep the
    // order the file has them in (`plan-record-order.ts`). That fallback is not
    // a corner case: a session stamps a whole page with one date, so stations
    // tie in page-sized groups and the tie is what picks the next page.
    const queued = records
        .filter((record) => QUEUED.includes(record.status))
        .sort((a, b) => (a.checked_on < b.checked_on ? -1 : a.checked_on > b.checked_on ? 1 : 0));
    if (queued.length === 0) {
        return 'nothing queued';
    }
    const oldest = queued[0].checked_on;
    const atOldest = queued.filter((record) => record.checked_on === oldest).length;
    const rows = queued
        .slice(0, page)
        .map((record) =>
            [record.checked_on, record.status, record.pref, record.city, record.name, record.date].join('\t')
        );
    return [...rows, '', `${queued.length} queued; oldest checked_on ${oldest}, shared by ${atOldest}`].join('\n');
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
            throw new Error(`unknown flag ${flag} here; this command takes ${allowed.map((f) => `--${f}`).join(' ')}`);
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

const USAGE = `usage: npm run plan:<verb> -- <name> <prefecture> [options]

  plan:list                          the oldest page of the research queue
  plan:show    <name> <pref>         one record, with its sources
  plan:edit    <name> <pref>         [--name N] [--pref P] [--city C] [--status S]
                                     [--date D] [--lat X --lng Y]
  plan:touch   <name> <pref>         record that it was checked, nothing else
  plan:add     <name> <pref>         --city C --status S --title T --url U
                                     [--date D] [--lat X --lng Y]
  plan:url:add <name> <pref>         --title T --url U
  plan:url:rm  <name> <pref>         --url U

The two positional arguments are the name and prefecture the station is filed
under now; every option carries a new value. Writing stamps checked_on.`;

// Options that name a field carry its new value, so the flag names are the
// field names -- `--name` renames, `--pref` refiles.
const EDIT_FLAGS = ['name', 'pref', 'city', 'status', 'date', 'lat', 'lng'];

// What a command leaves behind: the lines it prints, the master to write when
// it changed one, and anything the writer should notice that did not stop the
// write. Returning this rather than printing lets every verb share one write
// site and one output site -- and lets the dispatch be tested without touching
// the file.
export interface Outcome {
    output: string;
    records?: PlanRecord[];
    warnings?: string[];
}

// The tail the five writing verbs share, once they have decided what the record
// should become. A new record gets a line saying where it landed -- the one
// thing about it that the record itself does not show.
function written(records: PlanRecord[], index: number, after: PlanRecord, cities: City[]): Outcome {
    const placed = placeRecord(records, index, after, cities);
    const warnings = [
        coordinateWarning(after, cities),
        after.urls.length === 0 ? `${label(after)} now cites no source; add one before committing` : null,
    ];
    const heading =
        index === -1 ? `added ${label(after)} at record ${placed.indexOf(after) + 1} of ${placed.length}\n` : '';
    return {
        output: heading + describeRecord(after),
        records: placed,
        warnings: warnings.filter((warning) => warning !== null),
    };
}

export function execute(argv: string[], records: PlanRecord[], cities: City[], today: string): Outcome {
    const [verb, name, pref, ...options] = argv;

    // Every verb but `list` names a station. Resolving it where it is needed
    // rather than before the switch is what lets all seven sit in one.
    const requireStation = (): { name: string; pref: string } => {
        if (!name || !pref) {
            throw new Error(`missing the station name and prefecture\n\n${USAGE}`);
        }
        return { name, pref };
    };
    const getRecordIndex = (): number => {
        const station = requireStation();
        return findRecord(records, station.name, station.pref);
    };

    switch (verb) {
        case 'list':
            parseFlags(argv.slice(1), []);
            return { output: describeQueue(records, QUEUE_PAGE) };

        case 'show': {
            parseFlags(options, []);
            return { output: describeRecord(records[getRecordIndex()]) };
        }

        case 'add': {
            const station = requireStation();
            // Not EDIT_FLAGS: `name` and `pref` arrive positionally, so
            // accepting them as options too would let one be silently ignored.
            const flags = parseFlags(options, ['city', 'status', 'date', 'lat', 'lng', 'title', 'url']);
            requireFlags(flags, 'city', 'status', 'title', 'url');
            const coordinates = coordinatePatch(flags);
            const record = buildRecord({
                name: station.name,
                pref: station.pref,
                city: flags.city,
                status: flags.status,
                date: flags.date ?? '',
                lat: coordinates.lat ?? null,
                lng: coordinates.lng ?? null,
                urls: [{ title: flags.title, url: flags.url }],
                checked_on: today,
            });
            return written(records, -1, record, cities);
        }

        case 'touch': {
            parseFlags(options, []);
            const index = getRecordIndex();
            return written(records, index, setFields(records[index], {}, today), cities);
        }

        case 'edit': {
            const flags = parseFlags(options, EDIT_FLAGS);
            const patch: FieldPatch = coordinatePatch(flags);
            for (const key of ['name', 'pref', 'city', 'status', 'date'] as const) {
                if (key in flags) {
                    patch[key] = flags[key];
                }
            }
            const index = getRecordIndex();
            return written(records, index, setFields(records[index], patch, today), cities);
        }

        case 'url:add': {
            const flags = parseFlags(options, ['title', 'url']);
            requireFlags(flags, 'title', 'url');
            const index = getRecordIndex();
            const link = { title: flags.title, url: flags.url };
            return written(records, index, addUrl(records[index], link, today), cities);
        }

        case 'url:rm': {
            const flags = parseFlags(options, ['url']);
            requireFlags(flags, 'url');
            const index = getRecordIndex();
            return written(records, index, removeUrl(records[index], flags.url, today), cities);
        }

        default:
            throw new Error(`${verb ? `unknown command ${verb}` : 'no command'}\n\n${USAGE}`);
    }
}

function run(argv: string[]): void {
    const outcome = execute(
        argv,
        readJson<PlanRecord[]>(PLANS_FILENAME),
        readJson<City[]>(CITIES_FILENAME),
        todayInJst(new Date())
    );
    if (outcome.records) {
        writePlans(outcome.records);
    }
    console.log(outcome.output);
    for (const warning of outcome.warnings ?? []) {
        console.warn(`warning: ${warning}`);
    }
}

// Only run when invoked as a script, so the tests can import the transforms
// without the CLI reading the master and parsing vitest's own arguments.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    // `npm run plan:list | head -3` closes stdout while the page is still being
    // written. Node has no listener for that, so the EPIPE surfaces as an
    // unhandled 'error' event: exit 1 and a stack trace over an ordinary read.
    // It only shows through the npm wrapper (which pipes the child's stdout)
    // and depends on the write losing the race, so it cannot be left to chance.
    process.stdout.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code !== 'EPIPE') {
            throw error;
        }
        process.exit(0);
    });
    try {
        run(process.argv.slice(2));
    } catch (error) {
        console.error(`plan: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    }
}
