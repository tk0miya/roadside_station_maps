import { decodeJwt } from 'jose';
import type { AuthState, AuthUser } from '@shared/auth-types';
import { GOOGLE_CLIENT_ID } from '../config';

export const ID_TOKEN_STORAGE_KEY = 'auth:idToken';

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

type Listener = (state: AuthState) => void;

export class AuthManager {
    private state: AuthState = { user: null, idToken: null };
    private listeners: Set<Listener> = new Set();
    // True if the user was authenticated in this session or had a (possibly
    // expired) token in storage at startup. Used to gate silent re-login
    // attempts so brand-new visitors are not prompted unexpectedly.
    hadPreviousSession = false;

    constructor(private readonly clientId: string) {
        this.rehydrateFromStorage();
    }

    handleCredential(idToken: string): void {
        const user = this.verifyIdToken(idToken);
        if (!user) return;
        localStorage.setItem(ID_TOKEN_STORAGE_KEY, idToken);
        this.hadPreviousSession = true;
        this.setState({ user, idToken });
    }

    getState(): AuthState {
        return this.state;
    }

    subscribe(listener: Listener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    private rehydrateFromStorage(): void {
        const stored = localStorage.getItem(ID_TOKEN_STORAGE_KEY);
        if (!stored) return;

        this.hadPreviousSession = true;

        const user = this.verifyIdToken(stored);
        if (user) {
            this.state = { user, idToken: stored };
        } else {
            localStorage.removeItem(ID_TOKEN_STORAGE_KEY);
        }
    }

    private verifyIdToken(token: string): AuthUser | null {
        let payload: ReturnType<typeof decodeJwt>;
        try {
            payload = decodeJwt(token);
        } catch {
            return null;
        }
        const nowSeconds = Math.floor(Date.now() / 1000);

        if (typeof payload.iss !== 'string' || !GOOGLE_ISSUERS.includes(payload.iss)) return null;

        const audMatches = Array.isArray(payload.aud)
            ? payload.aud.includes(this.clientId)
            : payload.aud === this.clientId;
        if (!audMatches) return null;

        if (typeof payload.exp !== 'number' || payload.exp <= nowSeconds) return null;

        if (typeof payload.sub !== 'string' || payload.sub.length === 0) return null;

        return { sub: payload.sub };
    }

    private setState(next: AuthState): void {
        this.state = next;
        for (const listener of this.listeners) {
            listener(next);
        }
    }
}

let instance: AuthManager | null = null;

export function getAuthManagerInstance(): AuthManager {
    if (!instance) {
        instance = new AuthManager(GOOGLE_CLIENT_ID);
    }
    return instance;
}

// Exposed for tests to reset the singleton between cases.
export function resetAuthManagerInstanceForTests(): void {
    instance = null;
}
