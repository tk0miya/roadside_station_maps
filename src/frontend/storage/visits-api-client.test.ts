import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VisitsApiClient, VisitsApiError } from './visits-api-client';

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

function emptyResponse(status = 204): Response {
    return new Response(null, { status });
}

describe('VisitsApiClient', () => {
    let fetchMock: ReturnType<typeof vi.fn>;
    let client: VisitsApiClient;

    beforeEach(() => {
        fetchMock = vi.fn();
        client = new VisitsApiClient({
            baseUrl: 'https://api.example.com/',
            getIdToken: () => 'test-token',
            fetchImpl: fetchMock as unknown as typeof fetch,
        });
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
            'https://api.example.com/api/visits',
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
            'https://api.example.com/api/visits/123',
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
            'https://api.example.com/api/visits/123',
            expect.objectContaining({
                method: 'DELETE',
                headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
            })
        );
    });

    it('throws VisitsApiError without calling fetch when ID token is missing', async () => {
        const noTokenClient = new VisitsApiClient({
            baseUrl: 'https://api.example.com',
            getIdToken: () => null,
            fetchImpl: fetchMock as unknown as typeof fetch,
        });

        await expect(noTokenClient.list()).rejects.toBeInstanceOf(VisitsApiError);
        expect(fetchMock).not.toHaveBeenCalled();
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
            'https://api.example.com/api/visits/1%202%2F3',
            expect.anything()
        );
    });
});
