// Command-line client for the development-plan master (`data/plans.json`).
//
//   npm run --silent plan -- list --status=登録済み,計画中,凍結 --sort=checked_on --limit=10
//   npm run --silent plan -- show "道の駅 川崎町" 福岡県
//   npm run plan -- update "道の駅 石川町" 福島県 --date=2026-09-18 --status=登録済み
//   npm run plan -- url replace "道の駅 川崎町" 福岡県 --dead=<url> --url=<url> --title=<title>
//   npm run plan -- add --name=... --pref=... --city=... --status=計画中 --url=<url> --title=<title>
//
// This file only reads arguments and dispatches; every rule about the master
// lives in src/lib/plan-master.ts. Reading commands print JSON on stdout and
// nothing else, so their output pipes into jq; everything else -- progress,
// success, errors -- goes to stderr.
//
// The subcommands do not take the same shape of arguments (`list` and `add` take
// none, `show` and `update` take a name and a prefecture, `url` takes an action
// first), so each one declares its shape in COMMANDS and one checker enforces all
// of them. A violation is reported against the usage line of the command that
// raised it.

import { fileURLToPath } from 'node:url';
import type { PlanRecord, PlanUrl } from '../frontend/types/plan.js';
import { STATUSES } from '../frontend/types/plan.js';
import type { FieldUpdates, ListOptions, PlanKey } from '../lib/plan-master.js';
import * as PlanMaster from '../lib/plan-master.js';

// How a subcommand reads its positional arguments.
//   none       - takes none (list, add)
//   key        - a name and a prefecture (show, update)
//   action+key - an action, then a name and a prefecture (url)
type Shape = 'none' | 'key' | 'action+key';

interface CommandSpec {
    usage: string;
    shape: Shape;
    // Flags that must be present, and flags that may be. Anything else is
    // reported as unknown -- a typo in a flag would otherwise be dropped, and a
    // dropped --title writes a source with no label.
    required: readonly string[];
    optional: readonly string[];
    // Set by a command whose first positional picks among several operations,
    // each taking its own flags (`url`). When present, the flags are checked
    // against the chosen action instead of the two lists above.
    actions?: Record<string, UrlAction>;
    run: (parsed: ParsedArgs) => void;
}

interface UrlAction {
    required: readonly string[];
    run: (plan: PlanRecord, flags: Record<string, string>) => void;
}

// Field flags shared by update and add. `pref` and `city` are writable because a
// wrong location is something research turns up; both move the record's position,
// which check-in handles.
const FIELD_FLAGS = ['name', 'pref', 'city', 'status', 'date', 'lat', 'lng'] as const;

const USAGE = `Read and update the roadside-station development-plan master (data/plans.json).

Usage:
  npm run --silent plan -- list [--status=<a,b>] [--sort=checked_on] [--limit=<n>]
  npm run --silent plan -- show "<name>" <prefecture>
  npm run plan -- update "<name>" <prefecture> [--name=] [--pref=] [--city=]
                                               [--status=] [--date=] [--lat=] [--lng=]
  npm run plan -- url add     "<name>" <prefecture> --url=<url> --title=<title>
  npm run plan -- url replace "<name>" <prefecture> --dead=<url> --url=<url> --title=<title>
  npm run plan -- url remove  "<name>" <prefecture> --dead=<url>
  npm run plan -- url title   "<name>" <prefecture> --url=<url> --title=<title>
  npm run plan -- add --name=<name> --pref=<pref> --city=<city> --status=<status>
                      [--date=] [--lat=] [--lng=] --url=<url> --title=<title>

Commands:
  list     Print plans as JSON. Filter by status, order by checked_on, cut to a
           count. Aggregate with jq:
             npm run --silent plan -- list --status=計画中 | jq length
           Note the --silent: without it npm prints its banner to stdout and jq
           fails to parse the output.
  show     Print the one plan matched by the name and prefecture, as JSON.
  update   Write the given fields onto that plan. Fields left out keep their
           value; an empty value (--date=) clears one. Given no fields at all it
           records that the plan was researched and nothing about it changed.
  url      Edit the plan's source list: add one, replace one with another, remove
           one, or rewrite one's title.
  add      Append a new plan. Its position in the file is decided by the record
           order, not by where it is appended.

Every write stamps checked_on with today in Japan -- the day the plan was
researched. There is no flag to skip it.

Status values: ${STATUSES.join(', ')}
Date: free text, as precise as is known -- 2026-04-01, 2026-04, 2026年度, 2026夏
`;

export interface ParsedArgs {
    command: string;
    positionals: string[];
    flags: Record<string, string>;
}

// Accepts both --flag=value and --flag value. An empty value is meaningful (it
// clears a column), so --date= and --date "" are both kept.
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

// The name and prefecture of the plan to act on, from two positional arguments.
// Both are trimmed, so no message built from them carries stray spaces.
export function buildKey(positionals: string[], usage: string): PlanKey {
    // Station names hold spaces (道の駅 川崎町), so an unquoted one arrives split
    // across several arguments. The prefecture is the last of them either way.
    const args = positionals.map((positional) => positional.trim());
    const name = args[0];
    const pref = args.length > 1 ? args[args.length - 1] : '';

    if (!name) {
        throw new Error(`Missing plan name. Usage: ${usage}`);
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

// A number column, or null when the flag was given empty (--lat= clears it).
function buildCoordinate(value: string, field: string): number | null {
    if (value.trim() === '') {
        return null;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        throw new Error(`Invalid --${field}: ${value}. Expected a finite number, or an empty value to clear it.`);
    }
    return parsed;
}

// The field flags that were given, as an object the master's applyUpdates takes.
// Only the flags present appear, so a field left out keeps its value.
export function buildUpdates(flags: Record<string, string>): FieldUpdates {
    const updates: FieldUpdates = {};

    for (const field of FIELD_FLAGS) {
        const value = flags[field];
        if (value === undefined) {
            continue;
        }
        if (field === 'lat' || field === 'lng') {
            updates[field] = buildCoordinate(value, field);
        } else {
            // No column of the master is meant to carry surrounding whitespace.
            updates[field] = value.trim();
        }
    }

    return updates;
}

function buildLink(flags: Record<string, string>): PlanUrl {
    return { title: flags.title.trim(), url: flags.url.trim() };
}

export function buildListOptions(flags: Record<string, string>): ListOptions {
    const options: ListOptions = {};

    if (flags.status !== undefined) {
        options.statuses = flags.status.split(',').map((status) => status.trim());
    }
    if (flags.sort !== undefined) {
        if (flags.sort !== 'checked_on') {
            throw new Error(`Invalid --sort: ${flags.sort}. Valid values: checked_on`);
        }
        options.sort = flags.sort;
    }
    if (flags.limit !== undefined) {
        // An empty value clears a column elsewhere in this CLI, but Number('') is
        // 0, which would print an empty list -- indistinguishable from a queue
        // with nothing left in it. Rejected rather than read as a count.
        const limit = flags.limit.trim() === '' ? Number.NaN : Number(flags.limit);
        if (!Number.isInteger(limit) || limit < 0) {
            throw new Error(`Invalid --limit: ${flags.limit}. Expected a non-negative integer.`);
        }
        options.limit = limit;
    }

    return options;
}

function printJson(value: unknown): void {
    process.stdout.write(`${JSON.stringify(value, null, 4)}\n`);
}

function report(plan: PlanRecord, action: string): void {
    console.error(`${action} ${plan.name} (${plan.pref}). checked_on = ${plan.checked_on}`);
}

// The one place that writes the file. Both an edited plan and a brand-new one end
// here, so neither can reach data/plans.json without being stamped and put in
// order -- the same reason checkInPlan is the master's only entrance.
function checkIn(master: PlanMaster.Master, plan: PlanRecord, action: string): void {
    PlanMaster.checkInPlan(master, plan);
    PlanMaster.savePlans(master.plans);
    report(plan, action);
}

// Borrow the plan, let the caller edit it, then check it back in.
function editPlan(key: PlanKey, action: string, edit: (plan: PlanRecord) => void): void {
    const master = PlanMaster.load();
    const plan = PlanMaster.checkOutPlan(master, key);
    edit(plan);
    checkIn(master, plan, action);
}

// Which flag feeds which argument of the source operations. Exported so the
// wiring is testable: swapping --dead for --url in `replace` would drop the live
// source and keep the dead one, and every layer around it would still pass.
export const URL_ACTIONS: Record<string, UrlAction> = {
    add: {
        required: ['url', 'title'],
        run: (plan, flags) => PlanMaster.addUrl(plan, buildLink(flags)),
    },
    replace: {
        required: ['dead', 'url', 'title'],
        run: (plan, flags) => PlanMaster.replaceUrl(plan, flags.dead.trim(), buildLink(flags)),
    },
    remove: {
        required: ['dead'],
        run: (plan, flags) => PlanMaster.removeUrl(plan, flags.dead.trim()),
    },
    title: {
        required: ['url', 'title'],
        run: (plan, flags) => PlanMaster.setUrlTitle(plan, flags.url.trim(), flags.title.trim()),
    },
};

const URL_USAGE = 'npm run plan -- url <add|replace|remove|title> "<name>" <prefecture> [flags]';

// The usage line narrowed to one action, so a flag error points at the action
// that was asked for rather than at all four.
function urlUsage(action: string): string {
    return URL_USAGE.replace('<add|replace|remove|title>', action);
}

const COMMANDS: Record<string, CommandSpec> = {
    list: {
        usage: 'npm run --silent plan -- list [--status=<a,b>] [--sort=checked_on] [--limit=<n>]',
        shape: 'none',
        required: [],
        optional: ['status', 'sort', 'limit'],
        run: (parsed) => {
            const master = PlanMaster.load();
            printJson(PlanMaster.listPlans(master.plans, buildListOptions(parsed.flags)));
        },
    },
    show: {
        usage: 'npm run --silent plan -- show "<name>" <prefecture>',
        shape: 'key',
        required: [],
        optional: [],
        run: (parsed) => {
            const master = PlanMaster.load();
            printJson(PlanMaster.findPlan(master.plans, buildKey(parsed.positionals, COMMANDS.show.usage)));
        },
    },
    update: {
        usage: 'npm run plan -- update "<name>" <prefecture> [--status=] [--date=] ...',
        shape: 'key',
        required: [],
        optional: FIELD_FLAGS,
        run: (parsed) => {
            const key = buildKey(parsed.positionals, COMMANDS.update.usage);
            const updates = buildUpdates(parsed.flags);
            // No fields is a valid update: it records that the plan was
            // researched and nothing about it changed.
            const action = Object.keys(updates).length === 0 ? 'Checked' : 'Updated';
            editPlan(key, action, (plan) => PlanMaster.applyUpdates(plan, updates));
        },
    },
    url: {
        usage: URL_USAGE,
        shape: 'action+key',
        // The flags come from the chosen action; checkArgs reads them from here.
        required: [],
        optional: [],
        actions: URL_ACTIONS,
        run: (parsed) => {
            const [action, ...rest] = parsed.positionals;
            const actionSpec = URL_ACTIONS[action];
            const key = buildKey(rest, urlUsage(action));
            editPlan(key, 'Updated the sources of', (plan) => actionSpec.run(plan, parsed.flags));
        },
    },
    add: {
        usage: 'npm run plan -- add --name= --pref= --city= --status= --url= --title= [--date=] [--lat=] [--lng=]',
        shape: 'none',
        required: ['name', 'pref', 'city', 'status', 'url', 'title'],
        optional: ['date', 'lat', 'lng'],
        run: (parsed) => {
            const master = PlanMaster.load();
            // Nothing to check out: a new plan goes straight to the same check-in
            // an edited one does, which is what decides its place in the file.
            checkIn(master, PlanMaster.createPlan(buildUpdates(parsed.flags), buildLink(parsed.flags)), 'Added');
        },
    },
};

// Flags are checked against what the command declares, not just consumed, so a
// misspelled flag is an error rather than a silently ignored one.
function checkFlags(
    flags: Record<string, string>,
    required: readonly string[],
    allowed: readonly string[],
    usage: string
): void {
    for (const flag of required) {
        if (flags[flag] === undefined) {
            throw new Error(`Missing --${flag}. Usage: ${usage}`);
        }
    }

    const known = new Set([...required, ...allowed]);
    for (const flag of Object.keys(flags)) {
        if (!known.has(flag)) {
            const valid = [...known].map((name) => `--${name}`).join(', ');
            throw new Error(`Unknown option: --${flag}. Valid options: ${valid || '(none)'}. Usage: ${usage}`);
        }
    }
}

// The positional count each shape allows. `key` and `action+key` are checked
// loosely here and precisely by buildKey, which can tell an unquoted name from a
// missing prefecture and say how to fix it.
function checkPositionals(command: string, positionals: string[], spec: CommandSpec): void {
    if (spec.shape === 'none' && positionals.length > 0) {
        throw new Error(`${command} takes no arguments, got: ${positionals.join(' ')}. Usage: ${spec.usage}`);
    }
    if (spec.shape === 'action+key' && positionals.length === 0) {
        throw new Error(`Missing action. Usage: ${spec.usage}`);
    }
}

// Resolve the subcommand and hold its arguments to what it declares. Every shape
// check runs here, so no command reaches its own body with arguments it did not
// ask for.
export function checkArgs(parsed: ParsedArgs): CommandSpec {
    const spec = COMMANDS[parsed.command];

    if (spec === undefined) {
        throw new Error(`Unknown command: ${parsed.command}\n\n${USAGE}`);
    }

    checkPositionals(parsed.command, parsed.positionals, spec);

    const actions = spec.actions;
    if (actions === undefined) {
        checkFlags(parsed.flags, spec.required, spec.optional, spec.usage);
        return spec;
    }

    // A command with actions declares its flags per action, so allow exactly what
    // the chosen one requires: --title on a remove is a mistake, not a no-op.
    const [action] = parsed.positionals;
    const actionSpec = actions[action];
    if (actionSpec === undefined) {
        throw new Error(
            `Unknown url action: ${action}. Expected one of ${Object.keys(actions).join(' | ')}. ` +
                `Usage: ${spec.usage}`
        );
    }
    checkFlags(parsed.flags, actionSpec.required, [], urlUsage(action));

    return spec;
}

function main(): void {
    const args = process.argv.slice(2);

    if (args.length === 0 || args[0] === 'help' || args.includes('--help') || args.includes('-h')) {
        process.stdout.write(USAGE);
        return;
    }

    const parsed = parseArgs(args);
    checkArgs(parsed).run(parsed);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    try {
        main();
    } catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : error}`);
        process.exit(1);
    }
}
