// SpreadsheetApp-backed PlanStore.
//
// Kept as thin as possible: every decision worth testing lives in
// sheet-table.ts (grid ↔ entry mapping) or api.ts (row resolution).

import type { PlanStore } from './api';
import type { PlanPatch } from './plan-command';
import { buildCellUpdates, type PlanRow, type PlanTable, readTable } from './sheet-table';

export class SheetPlanStore implements PlanStore {
    private readonly sheet: GoogleAppsScript.Spreadsheet.Sheet;
    private table: PlanTable | null = null;

    constructor(sheet: GoogleAppsScript.Spreadsheet.Sheet) {
        this.sheet = sheet;
    }

    // A store instance serves one request and is never read again after it has
    // written, so the grid is read once and the cached table is never
    // invalidated.
    //
    // Display values rather than raw values: a date-formatted cell comes back as
    // the text the published CSV shows, which is what the map consumes.
    private read(): PlanTable {
        if (!this.table) {
            this.table = readTable(this.sheet.getDataRange().getDisplayValues());
        }
        return this.table;
    }

    list(): PlanRow[] {
        return this.read().rows;
    }

    // One setValue per column instead of rewriting the row: the untouched cells
    // keep whatever they hold, including formulas in columns the API does not
    // manage.
    updateRow(rowNumber: number, patch: PlanPatch): void {
        for (const { columnNumber, value } of buildCellUpdates(this.read().columns, patch)) {
            this.sheet.getRange(rowNumber, columnNumber).setValue(value);
        }
    }
}
