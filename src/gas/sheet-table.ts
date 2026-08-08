// Pure mapping between the spreadsheet grid and PlanEntry values.
//
// Nothing here touches SpreadsheetApp: the sheet is handed in as a grid of
// display strings and handed back as cell values, which keeps the whole
// column-matching and coercion story unit-testable outside Apps Script.

import { PLAN_COLUMNS, type PlanColumn, type PlanEntry, parseCoordinate, parseStatus } from '#shared/plan-types';
import { ApiError } from './errors';

// Sheet column index (0-based) for every column the API knows about.
export type ColumnIndex = Record<PlanColumn, number>;

// A data row together with its 1-based sheet row number, which is what the
// SpreadsheetApp range API needs in order to write the row back.
export interface PlanRow {
    rowNumber: number;
    entry: PlanEntry;
}

export interface PlanTable {
    columns: ColumnIndex;
    rows: PlanRow[];
}

function indexColumns(header: string[]): ColumnIndex {
    const columns = {} as ColumnIndex;
    const missing: string[] = [];

    for (const column of PLAN_COLUMNS) {
        const index = header.findIndex((cell) => cell.trim() === column);
        if (index === -1) {
            missing.push(column);
        } else {
            columns[column] = index;
        }
    }

    if (missing.length > 0) {
        throw new ApiError('internal', `Sheet is missing the column(s): ${missing.join(', ')}`);
    }
    return columns;
}

function cell(row: string[], index: number): string {
    return (row[index] ?? '').trim();
}

function toEntry(row: string[], columns: ColumnIndex): PlanEntry {
    return {
        name: cell(row, columns.name),
        pref: cell(row, columns.pref),
        city: cell(row, columns.city),
        status: parseStatus(cell(row, columns.status)),
        date: cell(row, columns.date),
        lat: parseCoordinate(cell(row, columns.lat)),
        lng: parseCoordinate(cell(row, columns.lng)),
        memo: row[columns.memo] ?? '',
    };
}

// `grid` is the sheet's display values including the header row. Nameless rows
// are dropped: the sheet uses them as spacing.
export function readTable(grid: string[][]): PlanTable {
    const [header, ...body] = grid;
    if (!header) {
        throw new ApiError('internal', 'Sheet is empty (no header row)');
    }

    const columns = indexColumns(header);
    const rows: PlanRow[] = [];

    body.forEach((row, index) => {
        const entry = toEntry(row, columns);
        if (entry.name !== '') {
            rows.push({ rowNumber: index + 2, entry });
        }
    });

    return { columns, rows };
}

// A cleared coordinate (null) writes an empty cell, which is how the sheet
// spells "no value".
function toCellValue(column: PlanColumn, patch: Partial<PlanEntry>): string | number {
    return patch[column] ?? '';
}

// Cells to write for a partial update, as 1-based sheet column numbers. Columns
// absent from `patch` produce no entry and so are never written, which is what
// leaves the rest of the row — unmanaged columns, formulas — as it was.
export function buildCellUpdates(
    columns: ColumnIndex,
    patch: Partial<PlanEntry>
): Array<{ columnNumber: number; value: string | number }> {
    return PLAN_COLUMNS.filter((column) => column in patch).map((column) => ({
        columnNumber: columns[column] + 1,
        value: toCellValue(column, patch),
    }));
}
