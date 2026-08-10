// Command-line client for the development-plan spreadsheet API.
//
//   npm run --silent plan:list
//   npm run --silent plan:show -- "道の駅◯◯" 福井県
//   npm run plan:update -- "道の駅◯◯" 福井県 --status=開業 --date=2026-04-01
//
// `list` and `show` take no filtering or formatting options; jq does that far
// better than any set of flags would. Their stdout is kept to JSON alone, and
// everything else (progress, success messages, errors) goes to stderr.

import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { list, type PlanEntry, update } from '../lib/plan-api.js';

// The sheet's four status values. Out-of-range values are silently rendered as
// 計画中 by the map, so they are rejected here rather than written. Kept as a
// local constant instead of importing the frontend's STATUSES: one line of
// duplication is cheaper than a scripts -> frontend dependency.
const STATUSES = ['開業', '登録済み', '計画中', '中止'];

// Columns update accepts, matching the sheet's header labels. `pref` and `city`
// are left out: `pref` is half of the key, and `city` places an entry rather
// than describing its progress, driving the map's fallback to the
// municipality's representative point. Correcting them is done in the
// spreadsheet, where the change is visible in context.
const UPDATABLE_FIELDS = ['name', 'status', 'date', 'lat', 'lng', 'memo'];

// Today in Japan. The sheet records Japanese days, so the machine running this --
// often on UTC -- does not get to decide which day it is. en-CA is the locale
// that formats a date as yyyy-mm-dd, the form the column holds.
function todayInJapan(): string {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
}

// The commands that take an entry key -- a name and a prefecture -- rather than
// operating on the sheet as a whole.
type KeyedCommand = 'show' | 'update';

// The usage line per keyed command. An error points at whichever command should
// have been used, which is not always the one that raised it.
const KEY_USAGE: Record<KeyedCommand, string> = {
    show: 'npm run --silent plan:show -- "<name>" <prefecture>',
    update: 'npm run plan:update -- "<name>" <prefecture> --status=開業',
};

const USAGE = `Read and update the roadside-station development-plan spreadsheet.

Usage:
  npm run --silent plan:list
  npm run --silent plan:show -- "<name>" <prefecture>
  npm run plan:update -- "<name>" <prefecture> [--name=<new name>]
                                               [--status=<status>] [--date=<text>]
                                               [--lat=<number>] [--lng=<number>]
                                               [--memo=<text>]

Commands:
  list     Print every entry as JSON. Filter it with jq:
             npm run --silent plan:list | jq -r '.[] | select(.status == "計画中") | .name'
           Note the --silent: without it npm prints its banner to stdout and jq
           fails to parse the output.
  show     Print the single entry matched exactly by the name and prefecture
           given as positional arguments -- the same key update writes by -- as
           JSON. Takes no options; pipe it through jq to pick fields out.
  update   Overwrite the given fields on the entry matched exactly by the name
           and prefecture given as positional arguments. Both are required:
           names are not unique across prefectures.
           Fields left out keep their current content; pass an empty value
           (e.g. --date=) to clear a field -- except --name, which every entry
           is identified by. pref and city are not writable here -- correct
           them in the spreadsheet.
           Given no fields at all, it records that the entry was researched
           and nothing about it changed.

Status values: ${STATUSES.join(', ')}
Date: free text, as precise as is known -- 2026-04-01, 2026-04, 2026, 2026夏
Checked on: every update stamps checked_on with today in Japan, the day the
            entry was researched. No flag sets it; clear it by emptying the
            cell in the spreadsheet.

Requires PLAN_API_URL in .env -- see .env.example.
`;

export interface ParsedArgs {
    command: string;
    positionals: string[];
    flags: Record<string, string>;
}

// Accepts both --flag=value and --flag value. An empty value is meaningful
// (it clears the cell), so --date= and --date "" are both kept.
export function parseArgs(args: string[]): ParsedArgs {
    const positionals: string[] = [];
    const flags: Record<string, string> = {};

    for (let index = 0; index < args.length; index++) {
        const arg = args[index];

        if (!arg.startsWith('--')) {
            positionals.push(arg);
            continue;
        }

        const separator = arg.indexOf('=');
        if (separator !== -1) {
            flags[arg.slice(2, separator)] = arg.slice(separator + 1);
            continue;
        }

        const value = args[index + 1];
        if (value === undefined || value.startsWith('--')) {
            throw new Error(`Missing value for ${arg}`);
        }
        flags[arg.slice(2)] = value;
        index++;
    }

    return {
        command: positionals[0] ?? '',
        positionals: positionals.slice(1),
        flags,
    };
}

// Reject what the Apps Script would choke on. It has no error handling, so an
// unknown column or a malformed value comes back as an HTML error page rather
// than a useful message -- cheaper to catch it before sending.
function validateField(field: string, value: string): void {
    // `name` is how every entry is identified, so unlike the other fields it
    // cannot be cleared.
    if (field === 'name' && value === '') {
        throw new Error('Invalid --name: the new name must not be empty.');
    }

    if (field === 'status' && !STATUSES.includes(value)) {
        throw new Error(`Invalid --status: ${value}. Valid values: ${STATUSES.join(', ')}`);
    }

    // `date` is deliberately unchecked: the sheet records whatever is known,
    // which may be a full date, a year, a year and month, or a season
    // ("2026夏"). No single pattern covers that.

    if ((field === 'lat' || field === 'lng') && value !== '' && Number.isNaN(Number(value))) {
        throw new Error(`Invalid --${field}: ${value}. Expected a number, or an empty value to clear it.`);
    }
}

// The key of the entry to show or update, taken from the two positional
// arguments: its name and its prefecture. Both are trimmed, so what is sent and
// what is printed carry no stray spaces. `command` only picks the usage line the
// errors point at.
export function buildKey(positionals: string[], command: KeyedCommand): { name: string; pref: string } {
    const usage = KEY_USAGE[command];
    // Station names hold spaces (道の駅 川崎町), so an unquoted one arrives split
    // across several arguments. The prefecture is the last of them either way.
    const args = positionals.map((positional) => positional.trim());
    const name = args[0];
    const pref = args.length > 1 ? args[args.length - 1] : '';

    if (!name) {
        throw new Error(`Missing entry name. Usage: ${usage}`);
    }
    if (!pref) {
        throw new Error(`Missing prefecture for ${name}. Names are not unique across prefectures. Usage: ${usage}`);
    }
    // Checked before the argument count, so an unquoted name that also lacks a
    // prefecture is reported as a problem with the prefecture rather than as a
    // quoting slip whose suggested fix fails in turn.
    if (!/[都道府県]$/.test(pref)) {
        throw new Error(
            `Invalid prefecture: ${pref}. Expected a name ending in 都/道/府/県 -- quote a station name ` +
                `that holds spaces. Usage: ${usage}`
        );
    }
    if (args.length > 2) {
        throw new Error(`Unexpected extra arguments. Quote the name: "${args.slice(0, -1).join(' ')}" ${pref}`);
    }

    return { name, pref };
}

// Everything an update writes: the fields the caller gave, plus `checked_on`.
//
// That column records the day an entry was last researched, and every update is
// part of a research pass, so the day is always the day of the run -- there is
// nothing for the caller to say and several ways to say it wrong. Writing it here
// also means it cannot be left out, which is what the column is worth: research
// passes take the least recently checked entries, so an update that skipped the
// stamp would leave that entry at the head of the queue to be researched again,
// and nothing about it would look like a failure.
//
// No flags at all is therefore a valid update -- it records that the entry was
// researched and nothing about it changed, which is most of what a pass finds.
// To clear the column, empty the cell in the spreadsheet.
export function buildValues(flags: Record<string, string>): Record<string, string> {
    const values: Record<string, string> = { checked_on: todayInJapan() };

    for (const [field, value] of Object.entries(flags)) {
        if (!UPDATABLE_FIELDS.includes(field)) {
            const valid = UPDATABLE_FIELDS.map((f) => `--${f}`).join(', ');
            throw new Error(`Unknown field: --${field}. Valid fields: ${valid}`);
        }
        // No column of the sheet is meant to carry surrounding whitespace, so
        // values are validated and written in their trimmed form.
        const trimmed = value.trim();
        validateField(field, trimmed);
        values[field] = trimmed;
    }

    return values;
}

// Neither read command takes options. An option here is either a filter, which
// jq does, or one of update's fields, so the error points at both.
export function rejectFlags(command: 'list' | 'show', flags: Record<string, string>): void {
    const [flag] = Object.keys(flags);
    if (flag) {
        throw new Error(
            `Unknown option: --${flag}. ${command} only reads -- pipe its JSON through jq, ` +
                `or write with: ${KEY_USAGE.update}`
        );
    }
}

// The one entry a key selects. doGet has no per-entry read and returns the whole
// sheet, so the key is matched here, by the same exact equality on both columns
// that gas/plan.js uses for update -- which also refuses to write when the key
// matches more than one row.
export function selectEntry(entries: PlanEntry[], name: string, pref: string): PlanEntry {
    const matched = entries.filter((entry) => entry.name === name && entry.pref === pref);

    if (matched.length === 0) {
        throw new Error(`No entry named ${name} in ${pref}.`);
    }
    if (matched.length > 1) {
        throw new Error(`${matched.length} entries named ${name} in ${pref}. Remove the duplicate in the sheet.`);
    }

    return matched[0];
}

async function runList(parsed: ParsedArgs): Promise<void> {
    rejectFlags('list', parsed.flags);
    if (parsed.positionals.length > 0) {
        throw new Error(`list takes no arguments. To look one entry up: ${KEY_USAGE.show}`);
    }

    const entries = await list();
    process.stdout.write(`${JSON.stringify(entries, null, 2)}\n`);
}

async function runShow(parsed: ParsedArgs): Promise<void> {
    rejectFlags('show', parsed.flags);
    const { name, pref } = buildKey(parsed.positionals, 'show');

    const entry = selectEntry(await list(), name, pref);
    process.stdout.write(`${JSON.stringify(entry, null, 2)}\n`);
}

async function runUpdate(parsed: ParsedArgs): Promise<void> {
    const { name, pref } = buildKey(parsed.positionals, 'update');
    const values = buildValues(parsed.flags);

    const result = await update(name, pref, values);
    if (!result.updated) {
        throw new Error(`Update error: ${name} (${pref}) (matched: ${result.matched})`);
    }

    console.error(`Updated ${name} (${pref}) (row ${result.row}).`);
}

async function main(): Promise<void> {
    const args = process.argv.slice(2);

    if (args.length === 0 || args[0] === 'help' || args.includes('--help') || args.includes('-h')) {
        process.stdout.write(USAGE);
        return;
    }

    const parsed = parseArgs(args);

    switch (parsed.command) {
        case 'list':
            await runList(parsed);
            break;
        case 'show':
            await runShow(parsed);
            break;
        case 'update':
            await runUpdate(parsed);
            break;
        default:
            throw new Error(`Unknown command: ${parsed.command}\n\n${USAGE}`);
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    config({ quiet: true });
    main().catch((error) => {
        console.error(`Error: ${error instanceof Error ? error.message : error}`);
        process.exit(1);
    });
}
