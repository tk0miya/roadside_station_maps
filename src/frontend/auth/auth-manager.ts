import { GOOGLE_CLIENT_ID } from './config';
import { verifyIdToken } from './jwt';
import type { AuthState } from '@shared/auth-types';

export const ID_TOKEN_STORAGE_KEY = 'auth:idToken';

type Listener = (state: AuthState) => void;

export class AuthManager {
    private state: AuthState = { user: null, idToken: null };
    private listeners: Set<Listener> = new Set();

    constructor(private readonly clientId: string) {
        this.rehydrateFromStorage();
    }

    handleCredential(idToken: string): void {
        try {
            const user = verifyIdToken(idToken, { clientId: this.clientId });
            localStorage.setItem(ID_TOKEN_STORAGE_KEY, idToken);
            this.setState({ user, idToken });
        } catch {
            // Invalid credentials are ignored; the user can retry signing in.
        }
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

        try {
            const user = verifyIdToken(stored, { clientId: this.clientId });
            this.state = { user, idToken: stored };
        } catch {
            localStorage.removeItem(ID_TOKEN_STORAGE_KEY);
        }
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
