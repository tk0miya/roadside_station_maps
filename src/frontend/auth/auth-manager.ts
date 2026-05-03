import { decodeJwt } from 'jose';
import type {
    AuthLoginRequest,
    AuthLoginResponse,
    AuthLogoutRequest,
    AuthRefreshRequest,
    AuthRefreshResponse,
    AuthState,
    AuthUser,
} from '@shared/auth-types';
import { API_BASE_URL } from '../config';

export const ACCESS_TOKEN_STORAGE_KEY = 'auth:accessToken';
export const REFRESH_TOKEN_STORAGE_KEY = 'auth:refreshToken';
// Legacy key from the previous Google id_token implementation; cleared at
// startup so stale tokens never linger.
const LEGACY_ID_TOKEN_STORAGE_KEY = 'auth:idToken';

// If the access token has fewer seconds than this until exp, refresh proactively
// when the tab regains visibility (or when callers ask for a fresh token).
const ACCESS_TOKEN_REFRESH_LEEWAY_SECONDS = 60;

type Listener = (state: AuthState) => void;

export interface AuthManagerOptions {
    fetchImpl?: typeof fetch;
    apiBaseUrl?: string;
}

export class AuthManager {
    private state: AuthState = { user: null, accessToken: null };
    private refreshTokenValue: string | null = null;
    private listeners: Set<Listener> = new Set();
    private refreshPromise: Promise<string | null> | null = null;
    private readonly fetchImpl: typeof fetch;
    private readonly apiBaseUrl: string;

    constructor(options: AuthManagerOptions = {}) {
        this.fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args));
        this.apiBaseUrl = options.apiBaseUrl ?? API_BASE_URL;
        this.rehydrateFromStorage();
    }

    getState(): AuthState {
        return this.state;
    }

    getAccessToken(): string | null {
        return this.state.accessToken;
    }

    getRefreshToken(): string | null {
        return this.refreshTokenValue;
    }

    subscribe(listener: Listener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    async login(code: string): Promise<void> {
        const body: AuthLoginRequest = { code };
        const response = await this.fetchImpl(`${this.apiBaseUrl}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            throw new Error(await readError(response, 'Login failed'));
        }
        const json = (await response.json()) as AuthLoginResponse;
        this.persistTokens(json.accessToken, json.refreshToken);
        this.setState({ user: json.user, accessToken: json.accessToken });
    }

    async logout(): Promise<void> {
        const refreshToken = this.refreshTokenValue;
        this.clearTokens();
        this.setState({ user: null, accessToken: null });
        if (!refreshToken) return;
        const body: AuthLogoutRequest = { refreshToken };
        try {
            await this.fetchImpl(`${this.apiBaseUrl}/auth/logout`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
        } catch {
            // Server-side revocation is best-effort; the client is already logged out.
        }
    }

    /**
     * Refreshes the access token using the stored refresh token.
     * Concurrent callers share a single in-flight request.
     * Returns the new access token, or `null` if refresh is impossible.
     */
    async refresh(): Promise<string | null> {
        if (this.refreshPromise) return this.refreshPromise;
        this.refreshPromise = this.doRefresh().finally(() => {
            this.refreshPromise = null;
        });
        return this.refreshPromise;
    }

    /**
     * If the current access token is missing or near expiry, refresh it.
     * Designed to be cheap to call repeatedly (e.g. from `visibilitychange`).
     */
    async ensureFreshAccessToken(): Promise<void> {
        if (!this.refreshTokenValue) return;
        const exp = readExpClaim(this.state.accessToken);
        if (exp !== null) {
            const remaining = exp - Math.floor(Date.now() / 1000);
            if (remaining > ACCESS_TOKEN_REFRESH_LEEWAY_SECONDS) return;
        }
        await this.refresh();
    }

    private async doRefresh(): Promise<string | null> {
        const refreshToken = this.refreshTokenValue;
        if (!refreshToken) return null;

        const body: AuthRefreshRequest = { refreshToken };
        let response: Response;
        try {
            response = await this.fetchImpl(`${this.apiBaseUrl}/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
        } catch {
            // Network error: leave the user logged in, callers can retry.
            return null;
        }

        if (response.status === 401) {
            this.clearTokens();
            this.setState({ user: null, accessToken: null });
            return null;
        }
        if (!response.ok) {
            // Transient server error; keep state intact so a later retry can recover.
            return null;
        }

        const json = (await response.json()) as AuthRefreshResponse;
        const user = readUserFromAccessToken(json.accessToken);
        if (!user) {
            this.clearTokens();
            this.setState({ user: null, accessToken: null });
            return null;
        }
        this.persistAccessToken(json.accessToken);
        this.setState({ user, accessToken: json.accessToken });
        return json.accessToken;
    }

    private rehydrateFromStorage(): void {
        localStorage.removeItem(LEGACY_ID_TOKEN_STORAGE_KEY);
        const accessToken = localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
        const refreshToken = localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
        if (!refreshToken) {
            // Without a refresh token we cannot recover; drop any stray access token.
            if (accessToken) localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
            return;
        }
        this.refreshTokenValue = refreshToken;

        if (accessToken) {
            const user = readUserFromAccessToken(accessToken);
            if (user && !isExpired(accessToken)) {
                this.state = { user, accessToken };
                return;
            }
            // Expired or malformed access token; keep the refresh token so we can
            // recover on the next API call (or via ensureFreshAccessToken).
            const fallbackUser = user ?? readUserFromAccessToken(accessToken);
            if (fallbackUser) {
                this.state = { user: fallbackUser, accessToken: null };
            }
        }
    }

    private persistTokens(accessToken: string, refreshToken: string): void {
        this.refreshTokenValue = refreshToken;
        localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, accessToken);
        localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refreshToken);
    }

    private persistAccessToken(accessToken: string): void {
        localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, accessToken);
    }

    private clearTokens(): void {
        this.refreshTokenValue = null;
        localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
        localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
    }

    private setState(next: AuthState): void {
        this.state = next;
        for (const listener of this.listeners) {
            listener(next);
        }
    }
}

function readUserFromAccessToken(token: string): AuthUser | null {
    try {
        const payload = decodeJwt(token);
        if (typeof payload.sub === 'string' && payload.sub.length > 0) {
            return { sub: payload.sub };
        }
    } catch {
        // fall through
    }
    return null;
}

function readExpClaim(token: string | null): number | null {
    if (!token) return null;
    try {
        const payload = decodeJwt(token);
        return typeof payload.exp === 'number' ? payload.exp : null;
    } catch {
        return null;
    }
}

function isExpired(token: string): boolean {
    const exp = readExpClaim(token);
    if (exp === null) return true;
    return exp <= Math.floor(Date.now() / 1000);
}

async function readError(response: Response, fallback: string): Promise<string> {
    try {
        const body = (await response.json()) as { error?: string };
        if (body && typeof body.error === 'string') return body.error;
    } catch {
        // ignore
    }
    return fallback;
}
