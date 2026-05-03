import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { emptyResponse, jsonResponse } from '@test-utils/test-utils';
import { API_BASE_URL } from '../config';
import { VisitsApiClient, VisitsApiError } from './visits-api-client';

describe('VisitsApiClient', () => {
    let fetchMock: MockInstance<typeof fetch>;
    let client: VisitsApiClient;

    beforeEach(() => {
        fetchMock = vi.spyOn(globalThis, 'fetch');
        client = new VisitsApiClient({ getSessionToken: () => 'test-token' });
    });

    afterEach(() => {
        fetchMock.mockRestore();
    });

    it('GETs /api/visits with the bearer token', async () => {
        fetchMock.mockResolvedValueOnce(
            jsonResponse({
                visits: [{ stationId: '123', styleId: 1, updatedAt: 1000 }],
            })
        );

        const visits = await client.list();

        expect(visits).toEqual([{ stationId: '123', styleId: 1, updatedAt: 1000 }]);
        expect(fetchMock).toHaveBeenCalledWith(
            `${API_BASE_URL}/api/visits`,
            expect.objectContaining({
                method: 'GET',
                headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
            })
        );
    });

    it('PUTs a single visit with JSON body', async () => {
        fetchMock.mockResolvedValueOnce(emptyResponse());

        await client.put('123', 2);

        expect(fetchMock).toHaveBeenCalledWith(
            `${API_BASE_URL}/api/visits/123`,
            expect.objectContaining({
                method: 'PUT',
                body: JSON.stringify({ styleId: 2 }),
                headers: expect.objectContaining({
                    Authorization: 'Bearer test-token',
                    'Content-Type': 'application/json',
                }),
            })
        );
    });

    it('DELETEs a visit', async () => {
        fetchMock.mockResolvedValueOnce(emptyResponse());

        await client.delete('123');

        expect(fetchMock).toHaveBeenCalledWith(
            `${API_BASE_URL}/api/visits/123`,
            expect.objectContaining({
                method: 'DELETE',
                headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
            })
        );
    });

    it('throws VisitsApiError without calling fetch when session token is missing', async () => {
        const noTokenClient = new VisitsApiClient({ getSessionToken: () => null });

        await expect(noTokenClient.list()).rejects.toBeInstanceOf(VisitsApiError);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('forwards rotated session tokens via the X-Session-Token response header', async () => {
        const onSessionRefreshed = vi.fn();
        const rotatingClient = new VisitsApiClient({
            getSessionToken: () => 'old-token',
            onSessionRefreshed,
        });

        fetchMock.mockResolvedValueOnce(
            new Response(JSON.stringify({ visits: [] }), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'X-Session-Token': 'fresh-token',
                },
            })
        );

        await rotatingClient.list();

        expect(onSessionRefreshed).toHaveBeenCalledWith('fresh-token');
    });

    it('invokes onUnauthorized when the API returns 401', async () => {
        const onUnauthorized = vi.fn();
        const guardedClient = new VisitsApiClient({
            getSessionToken: () => 'expired-token',
            onUnauthorized,
        });

        fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'Invalid token' }, 401));

        await expect(guardedClient.list()).rejects.toBeInstanceOf(VisitsApiError);
        expect(onUnauthorized).toHaveBeenCalledTimes(1);
    });

    it('throws VisitsApiError including the server-provided error message', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'Invalid style id' }, 400));

        await expect(client.put('123', 9)).rejects.toMatchObject({
            name: 'VisitsApiError',
            status: 400,
            message: 'Invalid style id',
        });
    });

    it('falls back to a generic message when the error body is not JSON', async () => {
        fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }));

        await expect(client.list()).rejects.toMatchObject({
            name: 'VisitsApiError',
            status: 500,
            message: 'Request failed with status 500',
        });
    });

    it('encodes station ids in the URL path', async () => {
        fetchMock.mockResolvedValueOnce(emptyResponse());

        await client.put('1 2/3', 1);

        expect(fetchMock).toHaveBeenCalledWith(
            `${API_BASE_URL}/api/visits/1%202%2F3`,
            expect.anything()
        );
    });
});
