/**
 * @vitest-environment jsdom
 * @vitest-environment-options { "url": "http://localhost" }
 */
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { buildSessionToken, jsonResponse } from '@test-utils/test-utils';
import { API_BASE_URL } from '../config';
import { AuthManager, AuthManagerError, SESSION_TOKEN_STORAGE_KEY } from './auth-manager';

describe('AuthManager', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('starts logged out with empty storage', () => {
        const manager = new AuthManager();

        expect(manager.getState()).toEqual({ user: null, sessionToken: null });
    });

    it('rehydrates from storage when a valid token is present', () => {
        const token = buildSessionToken({ sub: 'user-42' });
        localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, token);

        const manager = new AuthManager();

        expect(manager.getState().sessionToken).toBe(token);
        expect(manager.getState().user).toEqual({ sub: 'user-42' });
    });

    it('clears unparseable tokens from storage on construction', () => {
        localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, 'not-a-jwt');

        const manager = new AuthManager();

        expect(manager.getState().user).toBeNull();
        expect(localStorage.getItem(SESSION_TOKEN_STORAGE_KEY)).toBeNull();
    });

    it('clears expired tokens', () => {
        localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, buildSessionToken({ exp: 1000 }));

        const manager = new AuthManager();

        expect(manager.getState().user).toBeNull();
        expect(localStorage.getItem(SESSION_TOKEN_STORAGE_KEY)).toBeNull();
    });

    it('clears tokens that are missing exp', () => {
        localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, buildSessionToken({ exp: undefined }));

        const manager = new AuthManager();

        expect(manager.getState().user).toBeNull();
        expect(localStorage.getItem(SESSION_TOKEN_STORAGE_KEY)).toBeNull();
    });

    it('clears tokens that are missing sub', () => {
        localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, buildSessionToken({ sub: undefined }));

        const manager = new AuthManager();

        expect(manager.getState().user).toBeNull();
        expect(localStorage.getItem(SESSION_TOKEN_STORAGE_KEY)).toBeNull();
    });

    it('updates state, storage, and listeners when updateSessionToken is called', () => {
        const manager = new AuthManager();

        const listener = vi.fn();
        manager.subscribe(listener);

        const token = buildSessionToken({ sub: 'user-42' });
        manager.updateSessionToken(token);

        expect(localStorage.getItem(SESSION_TOKEN_STORAGE_KEY)).toBe(token);
        expect(manager.getState().user).toEqual({ sub: 'user-42' });
        expect(manager.getState().sessionToken).toBe(token);
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('ignores invalid tokens passed to updateSessionToken', () => {
        const manager = new AuthManager();

        manager.updateSessionToken('not-a-jwt');

        expect(manager.getState().user).toBeNull();
        expect(localStorage.getItem(SESSION_TOKEN_STORAGE_KEY)).toBeNull();
    });

    it('clearSession wipes the in-memory state and storage and notifies listeners', () => {
        localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, buildSessionToken({ sub: 'user-1' }));
        const manager = new AuthManager();
        const listener = vi.fn();
        manager.subscribe(listener);

        manager.clearSession();

        expect(manager.getState()).toEqual({ user: null, sessionToken: null });
        expect(localStorage.getItem(SESSION_TOKEN_STORAGE_KEY)).toBeNull();
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('allows unsubscribing listeners', () => {
        const manager = new AuthManager();

        const listener = vi.fn();
        const unsubscribe = manager.subscribe(listener);
        unsubscribe();

        manager.updateSessionToken(buildSessionToken());

        expect(listener).not.toHaveBeenCalled();
    });

    describe('login', () => {
        let fetchMock: MockInstance<typeof fetch>;

        beforeEach(() => {
            fetchMock = vi.spyOn(globalThis, 'fetch');
        });

        afterEach(() => {
            fetchMock.mockRestore();
        });

        it('exchanges the Google id_token for a session token via POST /sessions', async () => {
            const sessionToken = buildSessionToken({ sub: 'google-sub' });
            fetchMock.mockResolvedValueOnce(
                jsonResponse({ sessionToken, expiresAt: 9999999999 }, 201)
            );

            const manager = new AuthManager();
            await manager.login('google-id-token');

            expect(fetchMock).toHaveBeenCalledWith(
                `${API_BASE_URL}/sessions`,
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({ provider: 'google', idToken: 'google-id-token' }),
                })
            );
            expect(manager.getState().user).toEqual({ sub: 'google-sub' });
            expect(manager.getState().sessionToken).toBe(sessionToken);
        });

        it('throws AuthManagerError when the backend rejects the credential', async () => {
            fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'Invalid id_token' }, 401));

            const manager = new AuthManager();

            await expect(manager.login('bad-token')).rejects.toMatchObject({
                name: 'AuthManagerError',
                message: 'Invalid id_token',
            });
            expect(manager.getState().user).toBeNull();
        });

        it('exposes a typed error class', () => {
            expect(new AuthManagerError('boom').name).toBe('AuthManagerError');
        });
    });
});
