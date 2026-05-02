import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Storage } from '../storage/types';
import { AuthManager, ID_TOKEN_STORAGE_KEY } from './auth-manager';

function base64UrlEncode(input: string): string {
    return Buffer.from(input, 'utf8').toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function buildIdToken(payload: Record<string, unknown>): string {
    const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const body = base64UrlEncode(JSON.stringify(payload));
    return `${header}.${body}.sig`;
}

class InMemoryStorage implements Storage {
    private store = new Map<string, string>();

    getItem(key: string): string | null {
        return this.store.has(key) ? (this.store.get(key) as string) : null;
    }

    setItem(key: string, value: string): void {
        this.store.set(key, value);
    }

    removeItem(key: string): void {
        this.store.delete(key);
    }

    listItems(): string[] {
        return Array.from(this.store.keys());
    }
}

const CLIENT_ID = 'test-client-id';

function validToken(overrides: Record<string, unknown> = {}): string {
    return buildIdToken({
        sub: 'user-1',
        iss: 'https://accounts.google.com',
        aud: CLIENT_ID,
        exp: 9999999999,
        ...overrides,
    });
}

describe('AuthManager', () => {
    let storage: InMemoryStorage;

    beforeEach(() => {
        storage = new InMemoryStorage();
    });

    it('starts logged out with empty storage', () => {
        const manager = new AuthManager(storage, CLIENT_ID);

        expect(manager.getState()).toEqual({ user: null, idToken: null });
    });

    it('rehydrates from storage when a valid token is present', () => {
        const token = validToken({ sub: 'user-42' });
        storage.setItem(ID_TOKEN_STORAGE_KEY, token);

        const manager = new AuthManager(storage, CLIENT_ID);

        expect(manager.getState().idToken).toBe(token);
        expect(manager.getState().user).toEqual({ sub: 'user-42' });
    });

    it('clears invalid tokens from storage on construction', () => {
        storage.setItem(ID_TOKEN_STORAGE_KEY, 'not-a-jwt');

        const manager = new AuthManager(storage, CLIENT_ID);

        expect(manager.getState().user).toBeNull();
        expect(storage.getItem(ID_TOKEN_STORAGE_KEY)).toBeNull();
    });

    it('updates state, storage, and listeners when handleCredential is called', () => {
        const manager = new AuthManager(storage, CLIENT_ID);

        const listener = vi.fn();
        manager.subscribe(listener);

        const token = validToken({ sub: 'user-42' });
        manager.handleCredential(token);

        expect(storage.getItem(ID_TOKEN_STORAGE_KEY)).toBe(token);
        expect(manager.getState().user).toEqual({ sub: 'user-42' });
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('ignores invalid credentials without affecting state or storage', () => {
        const manager = new AuthManager(storage, CLIENT_ID);

        manager.handleCredential('not-a-jwt');

        expect(manager.getState().user).toBeNull();
        expect(storage.getItem(ID_TOKEN_STORAGE_KEY)).toBeNull();
    });

    it('allows unsubscribing listeners', () => {
        const manager = new AuthManager(storage, CLIENT_ID);

        const listener = vi.fn();
        const unsubscribe = manager.subscribe(listener);
        unsubscribe();

        manager.handleCredential(validToken());

        expect(listener).not.toHaveBeenCalled();
    });
});
