import type { CreateSessionRequest, CreateSessionResponse } from '@shared/api-types';
import type { AuthState } from '@shared/auth-types';
import { API_BASE_URL } from '../config';
import { decodeSessionToken, isSessionTokenExpired } from './session-token';

export const SESSION_TOKEN_STORAGE_KEY = 'auth:sessionToken';

type Listener = (state: AuthState) => void;

export class AuthManagerError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AuthManagerError';
    }
}

export class AuthManager {
    private state: AuthState = { user: null, sessionToken: null };
    private listeners: Set<Listener> = new Set();

    constructor() {
        this.rehydrateFromStorage();
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

    // Exchange a Google ID token for a backend-issued session JWT and persist it.
    async login(idToken: string): Promise<void> {
        const body: CreateSessionRequest = { provider: 'google', idToken };
        const response = await fetch(`${API_BASE_URL}/sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const message = await readErrorMessage(response);
            throw new AuthManagerError(message);
        }

        const json = (await response.json()) as CreateSessionResponse;
        this.updateSessionToken(json.sessionToken);
    }

    // Apply a freshly issued or rotated session token. Called by the login flow
    // and by the API client wrappers when the backend rotates via response headers.
    updateSessionToken(token: string): void {
        const claims = decodeSessionToken(token);
        if (!claims || isSessionTokenExpired(claims)) {
            return;
        }
        localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, token);
        this.setState({ user: { sub: claims.sub }, sessionToken: token });
    }

    // Wipe the local session. Called on explicit logout or when the API
    // returns 401 (server-side session no longer valid).
    clearSession(): void {
        localStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
        this.setState({ user: null, sessionToken: null });
    }

    private rehydrateFromStorage(): void {
        const stored = localStorage.getItem(SESSION_TOKEN_STORAGE_KEY);
        if (!stored) return;

        const claims = decodeSessionToken(stored);
        if (!claims || isSessionTokenExpired(claims)) {
            localStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
            return;
        }

        this.state = { user: { sub: claims.sub }, sessionToken: stored };
    }

    private setState(next: AuthState): void {
        this.state = next;
        for (const listener of this.listeners) {
            listener(next);
        }
    }
}

async function readErrorMessage(response: Response): Promise<string> {
    try {
        const body = (await response.json()) as { error?: string };
        if (body && typeof body.error === 'string') {
            return body.error;
        }
    } catch {
        // ignore JSON parse failures
    }
    return `Failed to create session (status ${response.status})`;
}
