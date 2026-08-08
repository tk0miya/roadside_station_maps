// Validation of an incoming request body into a typed command.
//
// Everything reaching the API is untrusted JSON, so this module is the single
// place that decides what a well-formed request looks like. It never touches
// the sheet: it only turns `unknown` into a PlanCommand or an ApiError.

import { type PlanColumn, type PlanEntry, STATUSES, type Status } from '#shared/plan-types';
import { ApiError } from './errors';

export type PlanCommand = { action: 'list' } | UpdateCommand;

export interface UpdateCommand {
    action: 'update';
    name: string;
    pref?: string;
    patch: PlanPatch;
}

// The columns an update may carry, as a type: a patch cannot even be built for
// a column the API refuses to write.
export type PlanPatch = Partial<Pick<PlanEntry, UpdatableColumn>>;

const ACTIONS = ['list', 'update'] as const;

// Columns an update may touch: the row's identifier, so it can be renamed, plus
// what this API exists to track — how a plan progresses. `pref` and `city` are
// deliberately absent; they are settled when a row is written by hand.
export const UPDATABLE_COLUMNS = [
    'name',
    'status',
    'date',
    'lat',
    'lng',
    'memo',
] as const satisfies readonly PlanColumn[];

type UpdatableColumn = (typeof UPDATABLE_COLUMNS)[number];

function badRequest(message: string): ApiError {
    return new ApiError('bad_request', message);
}

function asRecord(value: unknown, what: string): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw badRequest(`${what} must be an object`);
    }
    return value as Record<string, unknown>;
}

function asText(value: unknown, what: string): string {
    if (typeof value !== 'string') {
        throw badRequest(`${what} must be a string`);
    }
    return value.trim();
}

function asStatus(value: unknown): Status {
    const text = asText(value, 'status');
    if (!(STATUSES as readonly string[]).includes(text)) {
        throw badRequest(`status must be one of: ${STATUSES.join(', ')}`);
    }
    return text as Status;
}

// Coordinates accept a number, a numeric string (spreadsheet clients often send
// text) or null/'' to clear the cell. Trimming happens before the emptiness
// test, because Number(' ') is 0 — a whitespace cell would otherwise be written
// as a real coordinate on the equator.
function asCoordinate(value: unknown, column: 'lat' | 'lng'): number | null {
    const trimmed = typeof value === 'string' ? value.trim() : value;
    if (trimmed === null || trimmed === '') {
        return null;
    }
    const parsed = typeof trimmed === 'number' ? trimmed : typeof trimmed === 'string' ? Number(trimmed) : Number.NaN;
    if (!Number.isFinite(parsed)) {
        throw badRequest(`${column} must be a number, null or an empty string`);
    }
    const limit = column === 'lat' ? 90 : 180;
    if (parsed < -limit || parsed > limit) {
        throw badRequest(`${column} must be within -${limit}..${limit}`);
    }
    return parsed;
}

// An absent, empty or blank `pref` means "do not narrow the name down".
function optionalPref(value: unknown): string | undefined {
    if (value === undefined || value === null) {
        return undefined;
    }
    return asText(value, 'pref') || undefined;
}

function requiredName(value: unknown): string {
    const name = asText(value, 'name');
    if (name === '') {
        throw badRequest('name must not be empty');
    }
    return name;
}

// Only the keys actually present become part of the patch, so an update can
// clear a single cell without the caller having to restate the whole row.
// Anything else the request carries — an unknown key, or a column this API does
// not write — is ignored rather than rejected, so a caller may echo back a whole
// row it read. `memo` is the one field kept verbatim: trimming it would eat the
// blank lines that separate the URLs it holds.
function parsePatch(station: Record<string, unknown>): PlanPatch {
    const patch: PlanPatch = {};
    if ('name' in station) {
        patch.name = requiredName(station.name);
    }
    if ('status' in station) {
        patch.status = asStatus(station.status);
    }
    if ('date' in station) {
        patch.date = asText(station.date, 'date');
    }
    if ('lat' in station) {
        patch.lat = asCoordinate(station.lat, 'lat');
    }
    if ('lng' in station) {
        patch.lng = asCoordinate(station.lng, 'lng');
    }
    if ('memo' in station) {
        if (typeof station.memo !== 'string') {
            throw badRequest('memo must be a string');
        }
        patch.memo = station.memo;
    }
    return patch;
}

export function parseCommand(payload: unknown): PlanCommand {
    const body = asRecord(payload, 'Request body');
    const action = body.action ?? 'list';
    if (typeof action !== 'string' || !(ACTIONS as readonly string[]).includes(action)) {
        throw badRequest(`action must be one of: ${ACTIONS.join(', ')}`);
    }

    switch (action as (typeof ACTIONS)[number]) {
        case 'list':
            return { action: 'list' };
        case 'update':
            return {
                action: 'update',
                name: requiredName(body.name),
                pref: optionalPref(body.pref),
                patch: parsePatch(asRecord(body.station, 'station')),
            };
    }
}
