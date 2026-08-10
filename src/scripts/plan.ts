// Command-line client for the development-plan spreadsheet API.
//
//   npm run --silent plan:list
//   npm run plan:update -- "道の駅◯◯" 福井県 --status=開業 --date=2026-04-01
//
// `list` prints the sheet as JSON and does no filtering or formatting of its
// own; jq does that far better than any set of flags would. Because of that its
// stdout is kept to JSON alone, and everything else (progress, success
// messages, errors) goes to stderr.

import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { list, update } from '../lib/plan-api.js';

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

// The usage line buildKey's errors point at.
const KEY_USAGE = 'npm run plan:update -- "<name>" <prefecture> --status=開業';

const USAGE = `Read and update the roadside-station development-plan spreadsheet.

Usage:
  npm run --silent plan:list
  npm run plan:update -- "<name>" <prefecture> [--name=<new name>]
                                               [--status=<status>] [--date=<text>]
                                               [--lat=<number>] [--lng=<number>]
                                               [--memo=<text>]

Commands:
  list     Print every entry as JSON. Filter it with jq:
             npm run --silent plan:list | jq -r '.[] | select(.status == "計画中") | .name'
           Note the --silent: without it npm prints its banner to stdout and jq
           fails to parse the output.
  update   Overwrite the given fields on the entry matched exactly by the name
           and prefecture given as positional arguments. Both are required:
           names are not unique across prefectures.
           Fields left out keep their current content; pass an empty value
           (e.g. --date=) to clear a field -- except --name, which every entry
           is identified by. pref and city are not writable here -- correct
           them in the spreadsheet.

Status values: ${STATUSES.join(', ')}
Date: free text, as precise as is known -- 2026-04-01, 2026-04, 2026, 2026夏

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

// The key of the entry to update, taken from the two positional arguments: its
// name and its prefecture. Both are trimmed, so what is sent and what is printed
// carry no stray spaces.
export function buildKey(positionals: string[]): { name: string; pref: string } {
    // Station names hold spaces (道の駅 川崎町), so an unquoted one arrives split
    // across several arguments. The prefecture is the last of them either way.
    const args = positionals.map((positional) => positional.trim());
    const name = args[0];
    const pref = args.length > 1 ? args[args.length - 1] : '';

    if (!name) {
        throw new Error(`Missing entry name. Usage: ${KEY_USAGE}`);
    }
    if (!pref) {
        throw new Error(`Missing prefecture for ${name}. Names are not unique across prefectures. Usage: ${KEY_USAGE}`);
    }
    // Checked before the argument count, so an unquoted name that also lacks a
    // prefecture is reported as a problem with the prefecture rather than as a
    // quoting slip whose suggested fix fails in turn.
    if (!/[都道府県]$/.test(pref)) {
        throw new Error(
            `Invalid prefecture: ${pref}. Expected a name ending in 都/道/府/県 -- quote a station name ` +
                `that holds spaces. Usage: ${KEY_USAGE}`
        );
    }
    if (args.length > 2) {
        throw new Error(`Unexpected extra arguments. Quote the name: "${args.slice(0, -1).join(' ')}" ${pref}`);
    }

    return { name, pref };
}

export function buildValues(flags: Record<string, string>): Record<string, string> {
    const values: Record<string, string> = {};

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

    // The Apps Script happily reports updated: true for an empty `values`,
    // having written nothing, so an empty update is caught here instead.
    if (Object.keys(values).length === 0) {
        const valid = UPDATABLE_FIELDS.map((f) => `--${f}`).join(', ');
        throw new Error(`No fields to update. Give at least one of: ${valid}`);
    }

    return values;
}

async function runList(): Promise<void> {
    const entries = await list();
    process.stdout.write(`${JSON.stringify(entries, null, 2)}\n`);
}

async function runUpdate(parsed: ParsedArgs): Promise<void> {
    const { name, pref } = buildKey(parsed.positionals);
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
            await runList();
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
