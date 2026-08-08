// Column schema of the human-managed development-plan spreadsheet.
//
// The sheet is the single source of truth for the plan map. Two independent
// consumers must agree on its shape:
//   - src/frontend/  reads the sheet through its published CSV
//   - src/gas/       writes the sheet through the Apps Script API
// Anything both sides need to agree on lives here.

export const STATUSES = ['開業', '登録済み', '計画中', '中止'] as const;

export type Status = (typeof STATUSES)[number];

// Header names of the sheet, in their canonical order. Columns are matched by
// header text rather than position, so the sheet may reorder them or carry
// extra columns of its own.
export const PLAN_COLUMNS = ['name', 'pref', 'city', 'status', 'date', 'lat', 'lng', 'memo'] as const;

export type PlanColumn = (typeof PLAN_COLUMNS)[number];

// One row of the sheet. `date` stays a free-form string because the sheet also
// holds coarse values such as "2027年春"; `lat`/`lng` are null when the row
// carries no explicit coordinates.
export interface PlanEntry {
    name: string;
    pref: string;
    city: string;
    status: Status;
    date: string;
    lat: number | null;
    lng: number | null;
    memo: string;
}

// Reading a cell is forgiving, because the sheet is edited by hand: text that
// is not one of the four statuses reads as 計画中, and a blank or unparsable
// coordinate reads as "no coordinate". Writes are validated strictly instead —
// see src/gas/plan-command.ts.
export function parseStatus(value: string): Status {
    return (STATUSES as readonly string[]).includes(value) ? (value as Status) : '計画中';
}

export function parseCoordinate(value: string): number | null {
    const text = value.trim();
    if (text === '') {
        return null;
    }
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : null;
}
