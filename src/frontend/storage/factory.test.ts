/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { AuthTokenSource } from '../auth/fetch-with-auth';
import { API_BASE_URL } from '../config';
import { createStorage } from './factory';
import { MemoryStorage } from './memory-storage';
import { RemoteStorage } from './remote-storage';

function tokensFor(token: string | null): AuthTokenSource {
    return {
        getAccessToken: () => token,
        refresh: vi.fn().mockResolvedValue(null),
    };
}

describe('createStorage', () => {
    let originalLocation: Location;

    beforeEach(() => {
        vi.clearAllMocks();
        originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            value: { ...originalLocation, search: '' },
            writable: true,
        });
    });

    afterEach(() => {
        Object.defineProperty(window, 'location', { value: originalLocation, writable: true });
    });

    it('returns an empty MemoryStorage for guests', async () => {
        const storage = await createStorage({
            tokens: tokensFor(null),
            isSignedIn: () => false,
        });
        expect(storage).toBeInstanceOf(MemoryStorage);
        expect(storage.listItems()).toEqual([]);
    });

    it('returns a MemoryStorage hydrated from the shares API when share is set', async () => {
        Object.defineProperty(window, 'location', {
            value: { ...originalLocation, search: '?share=abc-123' },
            writable: true,
        });

        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(
                JSON.stringify({
                    visits: [
                        { stationId: '111', styleId: 1, updatedAt: 1000 },
                        { stationId: '222', styleId: 4, updatedAt: 1000 },
                    ],
                }),
                { status: 200, headers: { 'Content-Type': 'application/json' } }
            )
        );

        try {
            const storage = await createStorage({
                tokens: tokensFor('token-abc'),
                isSignedIn: () => true,
            });

            expect(storage).toBeInstanceOf(MemoryStorage);
            expect(storage.getItem('111')).toBe('1');
            expect(storage.getItem('222')).toBe('4');
            expect(fetchSpy).toHaveBeenCalledWith(
                `${API_BASE_URL}/shares/abc-123`,
                expect.objectContaining({ method: 'GET' })
            );
        } finally {
            fetchSpy.mockRestore();
        }
    });

    it('returns a RemoteStorage hydrated from the API for signed-in users', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(
                JSON.stringify({
                    visits: [{ stationId: '111', styleId: 2, updatedAt: 1000 }],
                }),
                { status: 200, headers: { 'Content-Type': 'application/json' } }
            )
        );

        try {
            const storage = await createStorage({
                tokens: tokensFor('token-abc'),
                isSignedIn: () => true,
            });

            expect(storage).toBeInstanceOf(RemoteStorage);
            expect(storage.getItem('111')).toBe('2');
            const [url, init] = fetchSpy.mock.calls[0];
            expect(url).toBe(`${API_BASE_URL}/api/visits`);
            expect((init as RequestInit).method).toBe('GET');
            expect(new Headers((init as RequestInit).headers).get('Authorization')).toBe(
                'Bearer token-abc'
            );
        } finally {
            fetchSpy.mockRestore();
        }
    });
});
