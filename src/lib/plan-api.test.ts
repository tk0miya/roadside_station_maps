import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { jsonResponse } from '#test-utils/test-utils';
import { list, update } from './plan-api';

const API_URL = 'https://script.google.com/macros/s/test/exec';

// The Apps Script has no error handling, so a failure inside it reaches the
// client as Google's HTML error page with a 200 status.
const HTML_ERROR_PAGE = '<!DOCTYPE html><html><body>Script function not found: doGet</body></html>';

describe('plan-api', () => {
    let fetchMock: MockInstance<typeof fetch>;

    beforeEach(() => {
        fetchMock = vi.spyOn(globalThis, 'fetch');
        process.env.PLAN_API_URL = API_URL;
    });

    afterEach(() => {
        fetchMock.mockRestore();
        delete process.env.PLAN_API_URL;
    });

    describe('list', () => {
        it('GETs the API and returns the entries unchanged', async () => {
            const entries = [
                { name: '道の駅あ', pref: '福井県', city: '福井市', status: '計画中', date: '', lat: 36.1, lng: 136.2 },
                {
                    name: '道の駅い',
                    pref: '福井県',
                    city: '敦賀市',
                    status: '開業',
                    date: '2026-04-01',
                    lat: '',
                    lng: '',
                },
            ];
            fetchMock.mockResolvedValueOnce(jsonResponse(entries));

            expect(await list()).toEqual(entries);
            expect(fetchMock).toHaveBeenCalledWith(API_URL);
        });

        it('reports a non-OK status', async () => {
            fetchMock.mockResolvedValueOnce(jsonResponse({}, 500));

            await expect(list()).rejects.toThrow('Failed to list: 500');
        });

        it('reports a non-JSON response body', async () => {
            fetchMock.mockResolvedValueOnce(new Response(HTML_ERROR_PAGE));

            await expect(list()).rejects.toThrow('non-JSON response');
        });

        it('reports an unset PLAN_API_URL instead of fetching', async () => {
            delete process.env.PLAN_API_URL;

            await expect(list()).rejects.toThrow('PLAN_API_URL is not set');
            expect(fetchMock).not.toHaveBeenCalled();
        });
    });

    describe('update', () => {
        it('POSTs the name and values as text/plain', async () => {
            fetchMock.mockResolvedValueOnce(jsonResponse({ updated: true, row: 12 }));

            const result = await update('道の駅あ', { status: '開業', date: '2026-04-01' });

            expect(result).toEqual({ updated: true, row: 12 });
            expect(fetchMock).toHaveBeenCalledWith(
                API_URL,
                expect.objectContaining({
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain' },
                    body: JSON.stringify({
                        name: '道の駅あ',
                        values: { status: '開業', date: '2026-04-01' },
                    }),
                })
            );
        });

        it('passes through a miss so the caller can report it', async () => {
            fetchMock.mockResolvedValueOnce(jsonResponse({ updated: false, row: null }));

            expect(await update('道の駅ない', { status: '開業' })).toEqual({ updated: false, row: null });
        });

        it('reports a non-OK status', async () => {
            fetchMock.mockResolvedValueOnce(jsonResponse({}, 403));

            await expect(update('道の駅あ', { status: '開業' })).rejects.toThrow('Failed to update: 403');
        });

        it('reports a non-JSON response body', async () => {
            fetchMock.mockResolvedValueOnce(new Response(HTML_ERROR_PAGE));

            await expect(update('道の駅あ', { status: '開業' })).rejects.toThrow('non-JSON response');
        });

        it('reports an unset PLAN_API_URL instead of fetching', async () => {
            delete process.env.PLAN_API_URL;

            await expect(update('道の駅あ', { status: '開業' })).rejects.toThrow('PLAN_API_URL is not set');
            expect(fetchMock).not.toHaveBeenCalled();
        });
    });
});
