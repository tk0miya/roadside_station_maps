/**
 * @vitest-environment jsdom
 * @vitest-environment-options { "url": "http://localhost" }
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildIdToken } from '@test-utils/test-utils';
import { AuthManager, ID_TOKEN_STORAGE_KEY } from './auth-manager';

const CLIENT_ID = 'test-client-id';

describe('AuthManager', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('starts logged out with empty storage', () => {
        const manager = new AuthManager(CLIENT_ID);

        expect(manager.getState()).toEqual({ user: null, idToken: null });
    });

    it('rehydrates from storage when a valid token is present', () => {
        const token = buildIdToken(CLIENT_ID, { sub: 'user-42' });
        localStorage.setItem(ID_TOKEN_STORAGE_KEY, token);

        const manager = new AuthManager(CLIENT_ID);

        expect(manager.getState().idToken).toBe(token);
        expect(manager.getState().user).toEqual({ sub: 'user-42' });
    });

    it('accepts the bare-host issuer', () => {
        const token = buildIdToken(CLIENT_ID, { iss: 'accounts.google.com' });
        localStorage.setItem(ID_TOKEN_STORAGE_KEY, token);

        const manager = new AuthManager(CLIENT_ID);

        expect(manager.getState().user).toEqual({ sub: 'user-1' });
    });

    it('accepts an audience array that includes the client id', () => {
        const token = buildIdToken(CLIENT_ID, { aud: ['other', CLIENT_ID] });
        localStorage.setItem(ID_TOKEN_STORAGE_KEY, token);

        const manager = new AuthManager(CLIENT_ID);

        expect(manager.getState().user).toEqual({ sub: 'user-1' });
    });

    it('clears invalid tokens from storage on construction', () => {
        localStorage.setItem(ID_TOKEN_STORAGE_KEY, 'not-a-jwt');

        const manager = new AuthManager(CLIENT_ID);

        expect(manager.getState().user).toBeNull();
        expect(localStorage.getItem(ID_TOKEN_STORAGE_KEY)).toBeNull();
    });

    it('clears tokens with a mismatched issuer', () => {
        localStorage.setItem(ID_TOKEN_STORAGE_KEY, buildIdToken(CLIENT_ID, { iss: 'https://evil.example' }));

        const manager = new AuthManager(CLIENT_ID);

        expect(manager.getState().user).toBeNull();
        expect(localStorage.getItem(ID_TOKEN_STORAGE_KEY)).toBeNull();
    });

    it('clears tokens with a mismatched audience', () => {
        localStorage.setItem(ID_TOKEN_STORAGE_KEY, buildIdToken(CLIENT_ID, { aud: 'other-client' }));

        const manager = new AuthManager(CLIENT_ID);

        expect(manager.getState().user).toBeNull();
        expect(localStorage.getItem(ID_TOKEN_STORAGE_KEY)).toBeNull();
    });

    it('clears expired tokens', () => {
        localStorage.setItem(ID_TOKEN_STORAGE_KEY, buildIdToken(CLIENT_ID, { exp: 1000 }));

        const manager = new AuthManager(CLIENT_ID);

        expect(manager.getState().user).toBeNull();
        expect(localStorage.getItem(ID_TOKEN_STORAGE_KEY)).toBeNull();
    });

    it('clears tokens that are missing exp', () => {
        const token = buildIdToken(CLIENT_ID, { sub: 'x', exp: undefined });
        localStorage.setItem(ID_TOKEN_STORAGE_KEY, token);

        const manager = new AuthManager(CLIENT_ID);

        expect(manager.getState().user).toBeNull();
        expect(localStorage.getItem(ID_TOKEN_STORAGE_KEY)).toBeNull();
    });

    it('clears tokens that are missing sub', () => {
        const token = buildIdToken(CLIENT_ID, { sub: undefined });
        localStorage.setItem(ID_TOKEN_STORAGE_KEY, token);

        const manager = new AuthManager(CLIENT_ID);

        expect(manager.getState().user).toBeNull();
        expect(localStorage.getItem(ID_TOKEN_STORAGE_KEY)).toBeNull();
    });

    it('updates state, storage, and listeners when handleCredential is called', () => {
        const manager = new AuthManager(CLIENT_ID);

        const listener = vi.fn();
        manager.subscribe(listener);

        const token = buildIdToken(CLIENT_ID, { sub: 'user-42' });
        manager.handleCredential(token);

        expect(localStorage.getItem(ID_TOKEN_STORAGE_KEY)).toBe(token);
        expect(manager.getState().user).toEqual({ sub: 'user-42' });
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('ignores invalid credentials without affecting state or storage', () => {
        const manager = new AuthManager(CLIENT_ID);

        manager.handleCredential('not-a-jwt');

        expect(manager.getState().user).toBeNull();
        expect(localStorage.getItem(ID_TOKEN_STORAGE_KEY)).toBeNull();
    });

    it('reports no previous session for empty storage', () => {
        const manager = new AuthManager(CLIENT_ID);

        expect(manager.hadPreviousSession).toBe(false);
    });

    it('reports a previous session when a valid token is rehydrated', () => {
        localStorage.setItem(ID_TOKEN_STORAGE_KEY, buildIdToken(CLIENT_ID));

        const manager = new AuthManager(CLIENT_ID);

        expect(manager.hadPreviousSession).toBe(true);
    });

    it('reports a previous session when an expired token is found in storage', () => {
        localStorage.setItem(ID_TOKEN_STORAGE_KEY, buildIdToken(CLIENT_ID, { exp: 1000 }));

        const manager = new AuthManager(CLIENT_ID);

        expect(manager.getState().user).toBeNull();
        expect(manager.hadPreviousSession).toBe(true);
    });

    it('reports a previous session after a successful handleCredential call', () => {
        const manager = new AuthManager(CLIENT_ID);
        expect(manager.hadPreviousSession).toBe(false);

        manager.handleCredential(buildIdToken(CLIENT_ID));

        expect(manager.hadPreviousSession).toBe(true);
    });

    it('allows unsubscribing listeners', () => {
        const manager = new AuthManager(CLIENT_ID);

        const listener = vi.fn();
        const unsubscribe = manager.subscribe(listener);
        unsubscribe();

        manager.handleCredential(buildIdToken(CLIENT_ID));

        expect(listener).not.toHaveBeenCalled();
    });
});
