import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import type { AuthTokenSource } from '../auth/fetch-with-auth';
import { API_BASE_URL } from '../config';
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

function tokensFor(token: string | null): AuthTokenSource {
    return {
        getAccessToken: () => token,
        refresh: vi.fn().mockResolvedValue(null),
    };
}

describe('VisitsApiClient', () => {
    let fetchMock: MockInstance<typeof fetch>;
    let client: VisitsApiClient;

    beforeEach(() => {
        fetchMock = vi.spyOn(globalThis, 'fetch');
        client = new VisitsApiClient({ tokens: tokensFor('test-token') });
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
            expect.objectContaining({ method: 'GET' })
        );
        const init = fetchMock.mock.calls[0][1] as RequestInit;
        const headers = new Headers(init.headers);
        expect(headers.get('Authorization')).toBe('Bearer test-token');
    });

    it('PUTs a single visit with JSON body', async () => {
        fetchMock.mockResolvedValueOnce(emptyResponse());

        await client.put('123', 2);

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe(`${API_BASE_URL}/api/visits/123`);
        expect((init as RequestInit).method).toBe('PUT');
        expect((init as RequestInit).body).toBe(JSON.stringify({ styleId: 2 }));
        const headers = new Headers((init as RequestInit).headers);
        expect(headers.get('Authorization')).toBe('Bearer test-token');
        expect(headers.get('Content-Type')).toBe('application/json');
    });

    it('DELETEs a visit', async () => {
        fetchMock.mockResolvedValueOnce(emptyResponse());

        await client.delete('123');

        expect(fetchMock).toHaveBeenCalledWith(
            `${API_BASE_URL}/api/visits/123`,
            expect.objectContaining({ method: 'DELETE' })
        );
    });

    it('throws VisitsApiError without calling fetch when access token is missing and refresh fails', async () => {
        const noTokenClient = new VisitsApiClient({ tokens: tokensFor(null) });

        await expect(noTokenClient.list()).rejects.toBeInstanceOf(VisitsApiError);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refreshes once and retries on 401', async () => {
        const refresh = vi.fn().mockResolvedValueOnce('new-token');
        const tokens: AuthTokenSource = {
            getAccessToken: () => 'old-token',
            refresh,
        };
        const retryingClient = new VisitsApiClient({ tokens });

        fetchMock
            .mockResolvedValueOnce(jsonResponse({ error: 'expired' }, 401))
            .mockResolvedValueOnce(jsonResponse({ visits: [] }));

        await retryingClient.list();

        expect(refresh).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        const second = fetchMock.mock.calls[1][1] as RequestInit;
        expect(new Headers(second.headers).get('Authorization')).toBe('Bearer new-token');
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
