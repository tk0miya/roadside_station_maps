// Which row an update lands on, decided from a set of rows already read.
//
// The rows carry no ID column, so a station is addressed by name. A name can
// repeat across the country but not within one prefecture, which is what makes
// `pref` a useful tie-breaker and a rename legal as long as it is unique where
// the row sits.

import type { PlanEntry } from '#shared/plan-types';
import { ApiError } from './errors';
import type { UpdateCommand } from './plan-command';
import type { PlanRow } from './sheet-table';

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

// The row an update should be written to, and what the caller will see once it
// has been. Applying the patch is left to the caller.
export interface UpdateTarget {
    rowNumber: number;
    station: PlanEntry;
}

export function resolveUpdate(rows: PlanRow[], command: UpdateCommand): UpdateTarget {
    const target = findTarget(rows, command.name, command.pref);
    if (command.patch.name !== undefined) {
        requireUnusedName(rows, command.patch.name, target);
    }
    return { rowNumber: target.rowNumber, station: { ...target.entry, ...command.patch } };
}
