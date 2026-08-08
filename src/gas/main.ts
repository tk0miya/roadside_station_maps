// Web app entry point for the development-plan sheet API: authentication,
// spreadsheet lookup and the JSON envelope. The exported `doPost` is turned
// into the top-level declaration Apps Script needs by esbuild.gas.config.ts.
//
// POST is the only entry point. A `doGet` would be a second door to `list`,
// which POST already serves, and it could only carry its token in the query
// string — where URLs leak it into histories, referrers and proxy logs.

import type { PlanEntry } from '#shared/plan-types';
import { ApiError } from './errors';
import { type PlanCommand, parseCommand } from './plan-command';
import { buildCellUpdates, readTable } from './sheet-table';
import { verifyToken } from './token';
import { resolveUpdate } from './update-target';

type PostEvent = GoogleAppsScript.Events.DoPost;

// Body of a successful response, merged into the `{ ok: true }` envelope.
type ApiResult = { stations: PlanEntry[] } | { station: PlanEntry };

function properties(): GoogleAppsScript.Properties.Properties {
    return PropertiesService.getScriptProperties();
}

// SPREADSHEET_ID lets the script run standalone; a container-bound script can
// leave it unset and use the sheet it belongs to. SHEET_NAME defaults to the
// first sheet, which is where the plan data lives today.
function openSheet(): GoogleAppsScript.Spreadsheet.Sheet {
    const scriptProperties = properties();
    const spreadsheetId = scriptProperties.getProperty('SPREADSHEET_ID');
    const spreadsheet = spreadsheetId ? SpreadsheetApp.openById(spreadsheetId) : SpreadsheetApp.getActiveSpreadsheet();
    if (!spreadsheet) {
        throw new ApiError('internal', 'No spreadsheet available; set the SPREADSHEET_ID script property');
    }

    const sheetName = scriptProperties.getProperty('SHEET_NAME');
    if (sheetName) {
        const named = spreadsheet.getSheetByName(sheetName);
        if (!named) {
            throw new ApiError('internal', `Sheet "${sheetName}" was not found`);
        }
        return named;
    }

    const first = spreadsheet.getSheets()[0];
    if (!first) {
        throw new ApiError('internal', 'The spreadsheet has no sheets');
    }
    return first;
}

function json(body: unknown): GoogleAppsScript.Content.TextOutput {
    return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}

// ApiError messages are written to be read: either by the caller who got the
// request wrong, or — for `internal` — by whoever has to fix the deployment,
// which only an authenticated caller ever reaches. Anything else is an
// unexpected failure with text nobody vetted, so it stays in the execution log.
function errorResponse(error: unknown): GoogleAppsScript.Content.TextOutput {
    if (error instanceof ApiError) {
        return json({ ok: false, error: { code: error.code, message: error.message } });
    }
    console.error(error);
    return json({ ok: false, error: { code: 'internal', message: 'Unexpected error; see the execution log' } });
}

function parseBody(event: PostEvent): unknown {
    const contents = event.postData?.contents;
    if (!contents) {
        throw new ApiError('bad_request', 'Request body is empty');
    }
    try {
        return JSON.parse(contents);
    } catch {
        throw new ApiError('bad_request', 'Request body is not valid JSON');
    }
}

// Display values rather than raw values: a date-formatted cell comes back as
// the text the published CSV shows.
//
// The grid is read once, and the row an update lands on comes from that
// snapshot: the write is only correct as long as nothing else moves the rows.
function executeCommand(command: PlanCommand, sheet: GoogleAppsScript.Spreadsheet.Sheet): ApiResult {
    const { columns, rows } = readTable(sheet.getDataRange().getDisplayValues());

    if (command.action === 'list') {
        return { stations: rows.map((row) => row.entry) };
    }

    const { rowNumber, station } = resolveUpdate(rows, command);
    for (const { columnNumber, value } of buildCellUpdates(columns, command.patch)) {
        sheet.getRange(rowNumber, columnNumber).setValue(value);
    }
    return { station };
}

// The request is `{ token, action, ... }` as JSON. Reporting an unparsable body
// before the token is checked tells the caller only what it already knows about
// its own request, so the order costs nothing.
export function doPost(event: PostEvent): GoogleAppsScript.Content.TextOutput {
    try {
        const payload = parseBody(event);
        const token =
            typeof payload === 'object' && payload !== null ? (payload as { token?: unknown }).token : undefined;

        verifyToken(token, properties().getProperty('API_TOKEN'));
        // Validated before the spreadsheet is opened, so a rejected request
        // never reaches it.
        const command = parseCommand(payload);
        return json({ ok: true, ...executeCommand(command, openSheet()) });
    } catch (error) {
        return errorResponse(error);
    }
}
