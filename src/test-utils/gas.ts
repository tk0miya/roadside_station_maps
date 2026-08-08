import { expect, vi } from 'vitest';
import type { PlanEntry } from '#shared/plan-types';
import { ApiError, type ErrorCode } from '../gas/errors';
import type { PlanRow } from '../gas/sheet-table';

// Asserts that `run` fails with an ApiError carrying `code`. The code is the
// part clients switch on, so a test that only pins the message would not notice
// a failure changing category.
export const expectApiError = (run: () => unknown, code: ErrorCode, message?: RegExp): void => {
    try {
        run();
    } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).code).toBe(code);
        if (message) {
            expect((error as ApiError).message).toMatch(message);
        }
        return;
    }
    expect.fail(`expected an ApiError with code "${code}"`);
};

// Consecutive sheet rows: row 1 is the header, so data starts at 2.
export const planRows = (entries: PlanEntry[]): PlanRow[] =>
    entries.map((entry, index) => ({ rowNumber: index + 2, entry }));

// A complete entry with harmless defaults, so a test only states the fields it
// actually cares about.
export const createPlanEntry = (overrides: Partial<PlanEntry> = {}): PlanEntry => ({
    name: '道の駅 テスト',
    pref: '長野県',
    city: '松本市',
    status: '計画中',
    date: '',
    lat: null,
    lng: null,
    memo: '',
    ...overrides,
});

export interface GasRuntimeStub {
    // Sheet contents as display values, header row included. Tests read it back
    // to assert what a request actually wrote.
    grid: string[][];
    // Which spreadsheet the request reached, if any: 'active' for a bound
    // script, the id passed to openById otherwise. Stays null while a request is
    // turned away before it can touch the spreadsheet.
    opened: 'active' | string | null;
    // One entry per console.error call, holding that call's arguments.
    errors: unknown[][];
}

export interface GasRuntimeOptions {
    scriptProperties?: Record<string, string>;
    // Name of the sheet (tab) the stub spreadsheet holds. Point SHEET_NAME
    // somewhere else to exercise the "sheet not found" path.
    sheetName?: string;
    // Makes every read of the sheet throw, standing in for an unexpected
    // SpreadsheetApp failure.
    failReads?: boolean;
    // Presents a spreadsheet with no sheets at all.
    noSheets?: boolean;
    // Stands in for a standalone script: there is no bound spreadsheet to fall
    // back on when SPREADSHEET_ID is unset.
    noSpreadsheet?: boolean;
}

// Installs the Apps Script globals src/gas/main.ts calls into. Vitest's
// stubGlobal is undone by `vi.unstubAllGlobals()`.
export const stubGasRuntime = (grid: string[][], options: GasRuntimeOptions = {}): GasRuntimeStub => {
    const {
        scriptProperties = {},
        sheetName = 'plan',
        failReads = false,
        noSheets = false,
        noSpreadsheet = false,
    } = options;
    const state: GasRuntimeStub = { grid, opened: null, errors: [] };

    const sheet = {
        getDataRange: () => ({
            getDisplayValues: () => {
                if (failReads) {
                    throw new Error('Service unavailable: Spreadsheets (secret-looking detail)');
                }
                return state.grid.map((row) => [...row]);
            },
        }),
        getRange: (row: number, column: number) => ({
            setValue: (value: string | number) => {
                state.grid[row - 1][column - 1] = String(value);
            },
        }),
    };

    const spreadsheet = {
        getSheets: () => (noSheets ? [] : [sheet]),
        getSheetByName: (name: string) => (name === sheetName ? sheet : null),
    };

    vi.stubGlobal('PropertiesService', {
        getScriptProperties: () => ({ getProperty: (key: string) => scriptProperties[key] ?? null }),
    });
    vi.stubGlobal('SpreadsheetApp', {
        getActiveSpreadsheet: () => {
            if (noSpreadsheet) {
                return null;
            }
            state.opened = 'active';
            return spreadsheet;
        },
        openById: (id: string) => {
            state.opened = id;
            return spreadsheet;
        },
    });
    vi.stubGlobal('ContentService', {
        MimeType: { JSON: 'application/json' },
        createTextOutput: (text: string) => {
            const output = { getContent: () => text, setMimeType: () => output };
            return output;
        },
    });
    vi.stubGlobal('console', { ...console, error: (...args: unknown[]) => state.errors.push(args) });

    return state;
};
