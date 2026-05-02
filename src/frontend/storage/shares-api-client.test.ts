import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { API_BASE_URL } from '../config';
import { SharesApiClient, SharesApiError } from './shares-api-client';

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

describe('SharesApiClient', () => {
    let fetchMock: MockInstance<typeof fetch>;
    let client: SharesApiClient;

    beforeEach(() => {
        fetchMock = vi.spyOn(globalThis, 'fetch');
        client = new SharesApiClient({ getIdToken: () => 'test-token' });
    });

    afterEach(() => {
        fetchMock.mockRestore();
    });

    it('POSTs /api/shares with the bearer token and returns the share id', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({ shareId: 'share-uuid' }, 201));

        const shareId = await client.create();

        expect(shareId).toBe('share-uuid');
        expect(fetchMock).toHaveBeenCalledWith(
            `${API_BASE_URL}/api/shares`,
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
            })
        );
    });

    it('throws SharesApiError without calling fetch when create() has no token', async () => {
        const noTokenClient = new SharesApiClient({ getIdToken: () => null });

        await expect(noTokenClient.create()).rejects.toBeInstanceOf(SharesApiError);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('GETs /shares/:id without auth and returns the visits', async () => {
        fetchMock.mockResolvedValueOnce(
            jsonResponse({
                visits: [
                    { stationId: '111', styleId: 1, updatedAt: 1000 },
                    { stationId: '222', styleId: 4, updatedAt: 2000 },
                ],
            })
        );

        const visits = await client.get('share-uuid');

        expect(visits).toEqual([
            { stationId: '111', styleId: 1, updatedAt: 1000 },
            { stationId: '222', styleId: 4, updatedAt: 2000 },
        ]);
        expect(fetchMock).toHaveBeenCalledWith(
            `${API_BASE_URL}/shares/share-uuid`,
            expect.objectContaining({ method: 'GET' })
        );
        const init = fetchMock.mock.calls[0][1] as RequestInit;
        expect(init.headers).toBeUndefined();
    });

    it('encodes the share id in the URL path', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({ visits: [] }));

        await client.get('a/b c');

        expect(fetchMock).toHaveBeenCalledWith(
            `${API_BASE_URL}/shares/a%2Fb%20c`,
            expect.anything()
        );
    });

    it('throws SharesApiError including the server-provided error message', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'Share not found' }, 404));

        await expect(client.get('missing-id')).rejects.toMatchObject({
            name: 'SharesApiError',
            status: 404,
            message: 'Share not found',
        });
    });

    it('falls back to a generic message when the error body is not JSON', async () => {
        fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }));

        await expect(client.get('any')).rejects.toMatchObject({
            name: 'SharesApiError',
            status: 500,
            message: 'Request failed with status 500',
        });
    });
});
