import { afterEach, describe, expect, it, vi } from 'vitest';
import { type GasRuntimeStub, stubGasRuntime } from '#test-utils/gas';
import { doPost } from './main';

const HEADER = ['name', 'pref', 'city', 'status', 'date', 'lat', 'lng', 'memo'];
const ROW_A = ['道の駅 A', '福井県', 'あわら市', '開業', '2023-04-22', '36.28', '136.25', 'https://a'];
const TOKEN = 's3cr3t';

interface Response {
    ok: boolean;
    stations?: unknown[];
    station?: Record<string, unknown>;
    error?: { code: string; message: string };
}

function newSheet(): GasRuntimeStub {
    return stubGasRuntime([[...HEADER], [...ROW_A]], { scriptProperties: { API_TOKEN: TOKEN } });
}

const post = (body: unknown): Response =>
    JSON.parse(doPost({ postData: { contents: JSON.stringify(body) } } as never).getContent());

const postRaw = (contents: string): Response => JSON.parse(doPost({ postData: { contents } } as never).getContent());

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('authentication', () => {
    it('accepts the configured token', () => {
        newSheet();
        expect(post({ token: TOKEN, action: 'list' }).ok).toBe(true);
    });

    it('rejects a request without a token', () => {
        const state = newSheet();
        expect(post({ action: 'list' })).toEqual({
            ok: false,
            error: { code: 'unauthorized', message: 'Missing or invalid API token' },
        });
        expect(state.opened).toBeNull();
    });

    it('rejects a wrong token without opening the spreadsheet', () => {
        const state = newSheet();
        expect(post({ token: 'nope', action: 'list' }).error?.code).toBe('unauthorized');
        expect(state.opened).toBeNull();
    });

    it('leaves the sheet alone when the token is wrong', () => {
        const state = newSheet();
        const response = post({ token: 'nope', action: 'update', name: '道の駅 A', station: { status: '中止' } });

        expect(response.error?.code).toBe('unauthorized');
        expect(state.grid[1]).toEqual(ROW_A);
    });

    it('refuses everything, and logs why, while API_TOKEN is unset', () => {
        const state = stubGasRuntime([[...HEADER]]);
        expect(post({ token: TOKEN, action: 'list' }).error?.code).toBe('unauthorized');
        expect(state.opened).toBeNull();
        expect(state.errors).toHaveLength(1);
    });
});

describe('request body', () => {
    it('reports an unparsable body', () => {
        newSheet();
        expect(postRaw('{').error).toEqual({ code: 'bad_request', message: 'Request body is not valid JSON' });
    });

    it('reports an empty body', () => {
        newSheet();
        expect(postRaw('').error?.code).toBe('bad_request');
    });

    it('rejects an invalid command before opening the spreadsheet', () => {
        const state = newSheet();
        const response = post({ token: TOKEN, action: 'update', name: '道の駅 A', station: { status: '検討中' } });

        expect(response.error?.code).toBe('bad_request');
        expect(state.opened).toBeNull();
    });
});

describe('spreadsheet selection', () => {
    it('uses the bound spreadsheet when SPREADSHEET_ID is unset', () => {
        const state = newSheet();
        expect(post({ token: TOKEN, action: 'list' }).ok).toBe(true);
        expect(state.opened).toBe('active');
    });

    it('opens SPREADSHEET_ID when the script is not bound to the sheet', () => {
        const state = stubGasRuntime([[...HEADER], [...ROW_A]], {
            scriptProperties: { API_TOKEN: TOKEN, SPREADSHEET_ID: 'sheet-123' },
        });

        expect(post({ token: TOKEN, action: 'list' }).ok).toBe(true);
        expect(state.opened).toBe('sheet-123');
    });

    it('honours SHEET_NAME', () => {
        stubGasRuntime([[...HEADER], [...ROW_A]], {
            scriptProperties: { API_TOKEN: TOKEN, SHEET_NAME: 'plan' },
            sheetName: 'plan',
        });

        expect(post({ token: TOKEN, action: 'list' }).stations).toHaveLength(1);
    });

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
        expect(post({ token: TOKEN, action: 'list' }).error?.code).toBe('internal');
    });

    it('points a standalone script at the SPREADSHEET_ID it is missing', () => {
        stubGasRuntime([[...HEADER]], { scriptProperties: { API_TOKEN: TOKEN }, noSpreadsheet: true });
        expect(post({ token: TOKEN, action: 'list' }).error).toEqual({
            code: 'internal',
            message: 'No spreadsheet available; set the SPREADSHEET_ID script property',
        });
    });
});

describe('unexpected failures', () => {
    it('logs the cause and answers with a generic message', () => {
        const state = stubGasRuntime([[...HEADER]], { scriptProperties: { API_TOKEN: TOKEN }, failReads: true });
        const response = post({ token: TOKEN, action: 'list' });

        expect(response.error).toEqual({ code: 'internal', message: 'Unexpected error; see the execution log' });
        expect(state.errors.flat().map(String).join(' ')).toContain('secret-looking detail');
    });
});

describe('list', () => {
    it('returns every named row', () => {
        newSheet();
        const response = post({ token: TOKEN, action: 'list' });

        expect(response.ok).toBe(true);
        expect(response.stations).toHaveLength(1);
    });
});

describe('update', () => {
    it('updates only the cells the request names', () => {
        const state = newSheet();
        const response = post({ token: TOKEN, action: 'update', name: '道の駅 A', station: { status: '中止' } });

        expect(response.station).toMatchObject({ name: '道の駅 A', status: '中止' });
        expect(state.grid[1]).toEqual([
            '道の駅 A',
            '福井県',
            'あわら市',
            '中止',
            '2023-04-22',
            '36.28',
            '136.25',
            'https://a',
        ]);
    });

    // Nameless spacer rows are skipped when listing but still occupy a sheet
    // row, so the row number a write lands on is not the station's position in
    // the listing.
    it('writes to the right row when the sheet holds spacer rows', () => {
        const spacer = ['', '', '', '', '', '', '', ''];
        const state = stubGasRuntime([[...HEADER], [...spacer], [...ROW_A]], {
            scriptProperties: { API_TOKEN: TOKEN },
        });

        expect(post({ token: TOKEN, action: 'update', name: '道の駅 A', station: { status: '中止' } }).ok).toBe(true);
        expect(state.grid[1]).toEqual(spacer);
        expect(state.grid[2][3]).toBe('中止');
    });
});
