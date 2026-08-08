// main.ts is wiring: token → command → sheet → JSON envelope. The rules it
// wires together are covered by the plain-function tests around it, so what is
// worth stubbing the Apps Script globals for is the wiring itself — that a
// request is turned away before the sheet is touched, and that an accepted one
// lands on the right cell.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubGasRuntime } from '#test-utils/gas';
import { doPost } from './main';

const HEADER = ['name', 'pref', 'city', 'status', 'date', 'lat', 'lng', 'memo'];
const SPACER = ['', '', '', '', '', '', '', ''];
const ROW_A = ['道の駅 A', '福井県', 'あわら市', '開業', '2023-04-22', '36.28', '136.25', 'https://a'];
const TOKEN = 's3cr3t';

interface Response {
    ok: boolean;
    stations?: unknown[];
    station?: Record<string, unknown>;
    error?: { code: string; message: string };
}

const post = (body: unknown): Response =>
    JSON.parse(doPost({ postData: { contents: JSON.stringify(body) } } as never).getContent());

const postRaw = (contents: string): Response => JSON.parse(doPost({ postData: { contents } } as never).getContent());

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('authentication', () => {
    it.each([
        ['a wrong token', { token: 'nope' }],
        ['no token at all', {}],
    ])('turns away %s before opening the sheet', (_label, credentials) => {
        const state = stubGasRuntime([[...HEADER], [...ROW_A]], { scriptProperties: { API_TOKEN: TOKEN } });
        const response = post({ ...credentials, action: 'update', name: '道の駅 A', station: { status: '中止' } });

        expect(response).toEqual({
            ok: false,
            error: { code: 'unauthorized', message: 'Missing or invalid API token' },
        });
        expect(state.opened).toBeNull();
    });

    it('refuses everything, and logs why, while API_TOKEN is unset', () => {
        const state = stubGasRuntime([[...HEADER]]);

        expect(post({ token: TOKEN, action: 'list' }).error?.code).toBe('unauthorized');
        expect(state.opened).toBeNull();
        expect(state.errors).toHaveLength(1);
    });
});

describe('spreadsheet selection', () => {
    it('reads the spreadsheet SPREADSHEET_ID names', () => {
        const state = stubGasRuntime([[...HEADER]], {
            scriptProperties: { API_TOKEN: TOKEN, SPREADSHEET_ID: 'sheet-123' },
        });

        expect(post({ token: TOKEN, action: 'list' }).ok).toBe(true);
        expect(state.opened).toBe('sheet-123');
    });

    it('falls back to the spreadsheet the script is bound to', () => {
        const state = stubGasRuntime([[...HEADER]], { scriptProperties: { API_TOKEN: TOKEN } });

        expect(post({ token: TOKEN, action: 'list' }).ok).toBe(true);
        expect(state.opened).toBe('active');
    });

    it('opens the tab SHEET_NAME names', () => {
        stubGasRuntime([[...HEADER], [...ROW_A]], {
            scriptProperties: { API_TOKEN: TOKEN, SHEET_NAME: 'plan' },
            sheetName: 'plan',
        });

        expect(post({ token: TOKEN, action: 'list' }).stations).toHaveLength(1);
    });

    // The three failures below are only ever read by whoever set the deployment
    // up, so the message is the whole of their value.
    it('reports a SHEET_NAME that does not exist', () => {
        stubGasRuntime([[...HEADER]], {
            scriptProperties: { API_TOKEN: TOKEN, SHEET_NAME: 'typo' },
            sheetName: 'plan',
        });

        expect(post({ token: TOKEN, action: 'list' }).error).toEqual({
            code: 'internal',
            message: 'Sheet "typo" was not found',
        });
    });

    it('reports a spreadsheet with no sheets', () => {
        stubGasRuntime([], { scriptProperties: { API_TOKEN: TOKEN }, noSheets: true });

        expect(post({ token: TOKEN, action: 'list' }).error).toEqual({
            code: 'internal',
            message: 'The spreadsheet has no sheets',
        });
    });

    it('points a standalone script at the SPREADSHEET_ID it is missing', () => {
        stubGasRuntime([[...HEADER]], { scriptProperties: { API_TOKEN: TOKEN }, noSpreadsheet: true });

        expect(post({ token: TOKEN, action: 'list' }).error).toEqual({
            code: 'internal',
            message: 'No spreadsheet available; set the SPREADSHEET_ID script property',
        });
    });
});

describe('request body', () => {
    it('reports an unparsable body', () => {
        stubGasRuntime([[...HEADER]], { scriptProperties: { API_TOKEN: TOKEN } });
        expect(postRaw('{').error).toEqual({ code: 'bad_request', message: 'Request body is not valid JSON' });
    });

    it('reports an empty body', () => {
        stubGasRuntime([[...HEADER]], { scriptProperties: { API_TOKEN: TOKEN } });
        expect(postRaw('').error).toEqual({ code: 'bad_request', message: 'Request body is empty' });
    });

    it('rejects an invalid command before opening the sheet', () => {
        const state = stubGasRuntime([[...HEADER], [...ROW_A]], { scriptProperties: { API_TOKEN: TOKEN } });
        const response = post({ token: TOKEN, action: 'update', name: '道の駅 A', station: { status: '検討中' } });

        expect(response.error?.code).toBe('bad_request');
        expect(state.opened).toBeNull();
    });
});

// Anything that is not an ApiError carries text nobody vetted for an anonymous
// reader, so only the execution log gets it.
describe('unexpected failures', () => {
    it('logs the cause and answers with a generic message', () => {
        const state = stubGasRuntime([[...HEADER]], { scriptProperties: { API_TOKEN: TOKEN }, failReads: true });
        const response = post({ token: TOKEN, action: 'list' });

        expect(response.error).toEqual({ code: 'internal', message: 'Unexpected error; see the execution log' });
        expect(state.errors.flat().map(String).join(' ')).toContain('secret-looking detail');
    });
});

describe('list', () => {
    it('returns the sheet contents', () => {
        stubGasRuntime([[...HEADER], [...ROW_A]], { scriptProperties: { API_TOKEN: TOKEN } });
        const response = post({ token: TOKEN, action: 'list' });

        expect(response.ok).toBe(true);
        expect(response.stations).toMatchObject([{ name: '道の駅 A' }]);
    });
});

describe('update', () => {
    // The spacer row is skipped when listing but still occupies a sheet row, so
    // the row a write lands on is not the station's position in the listing.
    it('writes the named cells to the right row and leaves the rest alone', () => {
        const state = stubGasRuntime([[...HEADER], [...SPACER], [...ROW_A]], {
            scriptProperties: { API_TOKEN: TOKEN },
        });
        const response = post({ token: TOKEN, action: 'update', name: '道の駅 A', station: { status: '中止' } });

        expect(response.station).toMatchObject({ name: '道の駅 A', status: '中止' });
        expect(state.grid[1]).toEqual(SPACER);
        expect(state.grid[2]).toEqual(['道の駅 A', '福井県', 'あわら市', '中止', ...ROW_A.slice(4)]);
    });
});
