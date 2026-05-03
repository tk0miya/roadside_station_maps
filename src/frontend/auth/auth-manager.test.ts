/**
 * @vitest-environment jsdom
 * @vitest-environment-options { "url": "http://localhost" }
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    ACCESS_TOKEN_STORAGE_KEY,
    AuthManager,
    REFRESH_TOKEN_STORAGE_KEY,
} from './auth-manager';

const LEGACY_ID_TOKEN_STORAGE_KEY = 'auth:idToken';

function base64UrlEncode(input: string): string {
    return Buffer.from(input, 'utf8')
        .toString('base64')
        .replace(/=+$/, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

function buildJwt(payload: Record<string, unknown>): string {
    const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = base64UrlEncode(JSON.stringify(payload));
    return `${header}.${body}.sig`;
}

const FAR_FUTURE = 9999999999;
const PAST = 1;

function freshAccessToken(sub = 'user-1'): string {
    return buildJwt({ sub, sid: 'sid-1', exp: FAR_FUTURE, aud: 'api' });
}

function expiredAccessToken(sub = 'user-1'): string {
    return buildJwt({ sub, sid: 'sid-1', exp: PAST, aud: 'api' });
}

function refreshToken(sub = 'user-1'): string {
    return buildJwt({ sub, sid: 'sid-1', aud: 'refresh' });
}

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

function makeFetch() {
    return vi.fn() as unknown as typeof fetch & { mock: { calls: unknown[][] } };
}

describe('AuthManager', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('starts logged out with empty storage', () => {
        const manager = new AuthManager({ fetchImpl: makeFetch() });

        expect(manager.getState()).toEqual({ user: null, accessToken: null });
        expect(manager.getRefreshToken()).toBeNull();
    });

    it('rehydrates user and access token from storage when both are present', () => {
        const access = freshAccessToken('user-42');
        const refresh = refreshToken('user-42');
        localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, access);
        localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refresh);

        const manager = new AuthManager({ fetchImpl: makeFetch() });

        expect(manager.getState()).toEqual({
            user: { sub: 'user-42' },
            accessToken: access,
        });
        expect(manager.getRefreshToken()).toBe(refresh);
    });

    it('keeps the user but drops an expired access token, leaving the refresh token in place', () => {
        const expired = expiredAccessToken('user-3');
        const refresh = refreshToken('user-3');
        localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, expired);
        localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refresh);

        const manager = new AuthManager({ fetchImpl: makeFetch() });

        expect(manager.getState().user).toEqual({ sub: 'user-3' });
        expect(manager.getState().accessToken).toBeNull();
        expect(manager.getRefreshToken()).toBe(refresh);
    });

    it('drops a stray access token if no refresh token is stored', () => {
        localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, freshAccessToken());

        const manager = new AuthManager({ fetchImpl: makeFetch() });

        expect(manager.getState()).toEqual({ user: null, accessToken: null });
        expect(localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)).toBeNull();
    });

    it('removes the legacy id_token storage key on startup', () => {
        localStorage.setItem(LEGACY_ID_TOKEN_STORAGE_KEY, 'legacy-token');

        new AuthManager({ fetchImpl: makeFetch() });

        expect(localStorage.getItem(LEGACY_ID_TOKEN_STORAGE_KEY)).toBeNull();
    });

    it('login posts the auth code and persists the returned tokens', async () => {
        const access = freshAccessToken('user-5');
        const refresh = refreshToken('user-5');
        const fetchImpl = vi.fn().mockResolvedValue(
            jsonResponse({ accessToken: access, refreshToken: refresh, user: { sub: 'user-5' } })
        );
        const manager = new AuthManager({
            fetchImpl: fetchImpl as unknown as typeof fetch,
            apiBaseUrl: 'https://api.example',
        });
        const listener = vi.fn();
        manager.subscribe(listener);

        await manager.login('auth-code-123');

        expect(fetchImpl).toHaveBeenCalledWith(
            'https://api.example/auth/login',
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({ code: 'auth-code-123' }),
            })
        );
        expect(localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)).toBe(access);
        expect(localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)).toBe(refresh);
        expect(manager.getState()).toEqual({ user: { sub: 'user-5' }, accessToken: access });
        expect(listener).toHaveBeenCalled();
    });

    it('login throws and does not persist when the server responds with an error', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: 'bad code' }, 401));
        const manager = new AuthManager({ fetchImpl: fetchImpl as unknown as typeof fetch });

        await expect(manager.login('x')).rejects.toThrow('bad code');
        expect(localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)).toBeNull();
        expect(manager.getState().user).toBeNull();
    });

    it('refresh updates the access token via /auth/refresh', async () => {
        localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, expiredAccessToken('user-9'));
        localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refreshToken('user-9'));

        const newAccess = freshAccessToken('user-9');
        const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ accessToken: newAccess }));
        const manager = new AuthManager({
            fetchImpl: fetchImpl as unknown as typeof fetch,
            apiBaseUrl: 'https://api.example',
        });

        const result = await manager.refresh();

        expect(result).toBe(newAccess);
        expect(fetchImpl).toHaveBeenCalledWith(
            'https://api.example/auth/refresh',
            expect.objectContaining({ method: 'POST' })
        );
        expect(manager.getState()).toEqual({ user: { sub: 'user-9' }, accessToken: newAccess });
        expect(localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)).toBe(newAccess);
    });

    it('coalesces concurrent refresh calls into a single network request', async () => {
        localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refreshToken());
        const newAccess = freshAccessToken();
        const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ accessToken: newAccess }));
        const manager = new AuthManager({ fetchImpl: fetchImpl as unknown as typeof fetch });

        const [a, b, c] = await Promise.all([
            manager.refresh(),
            manager.refresh(),
            manager.refresh(),
        ]);

        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(a).toBe(newAccess);
        expect(b).toBe(newAccess);
        expect(c).toBe(newAccess);
    });

    it('refresh returns null without changing state on network error', async () => {
        localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, freshAccessToken());
        localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refreshToken());

        const fetchImpl = vi.fn().mockRejectedValue(new Error('offline'));
        const manager = new AuthManager({ fetchImpl: fetchImpl as unknown as typeof fetch });

        const result = await manager.refresh();
        expect(result).toBeNull();
        expect(manager.getRefreshToken()).not.toBeNull();
    });

    it('refresh clears tokens on 401', async () => {
        localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, expiredAccessToken());
        localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refreshToken());

        const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: 'expired' }, 401));
        const manager = new AuthManager({ fetchImpl: fetchImpl as unknown as typeof fetch });

        const result = await manager.refresh();
        expect(result).toBeNull();
        expect(manager.getState()).toEqual({ user: null, accessToken: null });
        expect(localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)).toBeNull();
    });

    it('refresh does nothing without a refresh token', async () => {
        const fetchImpl = vi.fn();
        const manager = new AuthManager({ fetchImpl: fetchImpl as unknown as typeof fetch });

        const result = await manager.refresh();
        expect(result).toBeNull();
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('logout clears local tokens and posts to /auth/logout', async () => {
        const refresh = refreshToken();
        localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, freshAccessToken());
        localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refresh);

        const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
        const manager = new AuthManager({
            fetchImpl: fetchImpl as unknown as typeof fetch,
            apiBaseUrl: 'https://api.example',
        });

        await manager.logout();

        expect(manager.getState()).toEqual({ user: null, accessToken: null });
        expect(localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)).toBeNull();
        expect(fetchImpl).toHaveBeenCalledWith(
            'https://api.example/auth/logout',
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({ refreshToken: refresh }),
            })
        );
    });

    it('ensureFreshAccessToken is a no-op when access token has plenty of life left', async () => {
        localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, freshAccessToken());
        localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refreshToken());

        const fetchImpl = vi.fn();
        const manager = new AuthManager({ fetchImpl: fetchImpl as unknown as typeof fetch });

        await manager.ensureFreshAccessToken();

        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('ensureFreshAccessToken refreshes when the access token is expired', async () => {
        localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, expiredAccessToken());
        localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refreshToken());

        const newAccess = freshAccessToken();
        const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ accessToken: newAccess }));
        const manager = new AuthManager({ fetchImpl: fetchImpl as unknown as typeof fetch });

        await manager.ensureFreshAccessToken();

        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(manager.getState().accessToken).toBe(newAccess);
    });

    it('subscribers can unsubscribe', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(
            jsonResponse({
                accessToken: freshAccessToken(),
                refreshToken: refreshToken(),
                user: { sub: 'user-1' },
            })
        );
        const manager = new AuthManager({ fetchImpl: fetchImpl as unknown as typeof fetch });

        const listener = vi.fn();
        const unsubscribe = manager.subscribe(listener);
        unsubscribe();

        await manager.login('code');

        expect(listener).not.toHaveBeenCalled();
    });
});
