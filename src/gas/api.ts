// Command execution against the plan sheet.
//
// The store is deliberately dumb — it lists rows and overwrites cells within a
// single row, and nothing more. Deciding which row a name refers to, and
// refusing a rename onto a name already in use, happens here so it can be
// tested against an in-memory store instead of a live spreadsheet.
//
// Both the row number and the rename check come from the one `store.list()`
// snapshot taken at the top of executeCommand, so an update is only correct
// while nothing else writes to the sheet.
//
// The rows carry no ID column, so a station is addressed by name. A name can
// repeat across the country but not within one prefecture, which is what makes
// `pref` a useful tie-breaker and a rename legal as long as it is unique where
// the row sits.

import type { PlanEntry } from '#shared/plan-types';
import { ApiError } from './errors';
import type { PlanCommand, PlanPatch } from './plan-command';
import type { PlanRow } from './sheet-table';

export interface PlanStore {
    list(): PlanRow[];
    updateRow(rowNumber: number, patch: PlanPatch): void;
}

// Body of a successful response.
export type ApiResult = { stations: PlanEntry[] } | { station: PlanEntry };

// An ambiguity that survives `pref` is reported rather than resolved
// arbitrarily.
function findTarget(rows: PlanRow[], name: string, pref: string | undefined): PlanRow {
    const named = rows.filter((row) => row.entry.name === name);
    const matches = pref === undefined ? named : named.filter((row) => row.entry.pref === pref);
    const described = pref === undefined ? `"${name}"` : `"${name}" in ${pref}`;

    if (matches.length === 0) {
        throw new ApiError('not_found', `No station named ${described}`);
    }
    if (matches.length > 1) {
        // `pref` is only worth suggesting when it lands on exactly one row: a
        // prefecture shared by two matches leaves the caller no better off, and
        // a blank one cannot be asked for at all.
        const prefs = matches.map((row) => row.entry.pref);
        const separable = pref === undefined && !prefs.includes('') && new Set(prefs).size === prefs.length;
        const rowNumbers = matches.map((row) => row.rowNumber).join(', ');
        const hint = separable ? '; pass a top-level pref to narrow it down' : '; fix the sheet first';
        throw new ApiError('conflict', `${described} matches several rows (${rowNumbers})${hint}`);
    }
    return matches[0];
}

function requireUnusedName(rows: PlanRow[], name: string, target: PlanRow): void {
    const pref = target.entry.pref;
    const taken = rows.some(
        (row) => row.rowNumber !== target.rowNumber && row.entry.name === name && row.entry.pref === pref
    );
    if (taken) {
        const where = pref === '' ? 'among the rows without a prefecture' : `in ${pref}`;
        throw new ApiError('conflict', `A station named "${name}" already exists ${where}`);
    }
}

export function executeCommand(command: PlanCommand, store: PlanStore): ApiResult {
    const rows = store.list();

    switch (command.action) {
        case 'list':
            return { stations: rows.map((row) => row.entry) };

        case 'update': {
            const target = findTarget(rows, command.name, command.pref);
            if (command.patch.name !== undefined) {
                requireUnusedName(rows, command.patch.name, target);
            }
            store.updateRow(target.rowNumber, command.patch);
            return { station: { ...target.entry, ...command.patch } };
        }
    }
}
