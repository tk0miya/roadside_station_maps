export interface AuthTokenSource {
    getAccessToken(): string | null;
    refresh(): Promise<string | null>;
}

/**
 * Wraps `fetch` so that:
 *   - The current access token is attached as a Bearer header.
 *   - A 401 response triggers a single refresh + retry attempt.
 *
 * The given `tokens` source is responsible for de-duplicating concurrent
 * refresh calls (see AuthManager.refresh).
 */
export async function fetchWithAuth(
    tokens: AuthTokenSource,
    input: string,
    init: RequestInit = {}
): Promise<Response> {
    const accessToken = tokens.getAccessToken();
    if (!accessToken) {
        // Trigger a refresh first; useful when the page rehydrated with only
        // a refresh token (access token expired before the tab was reopened).
        const refreshed = await tokens.refresh();
        if (!refreshed) {
            throw new MissingAccessTokenError();
        }
        return doFetch(refreshed, input, init);
    }

    const response = await doFetch(accessToken, input, init);
    if (response.status !== 401) return response;

    const refreshed = await tokens.refresh();
    if (!refreshed) return response;
    return doFetch(refreshed, input, init);
}

function doFetch(token: string, input: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    return fetch(input, { ...init, headers });
}

export class MissingAccessTokenError extends Error {
    constructor() {
        super('Missing access token; user must be signed in');
        this.name = 'MissingAccessTokenError';
    }
}
