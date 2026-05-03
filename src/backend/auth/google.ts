import { createRemoteJWKSet, jwtVerify } from 'jose';

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
// Sentinel returned by Google's token endpoint when the refresh_token has been
// revoked or has expired.
const GOOGLE_INVALID_GRANT = 'invalid_grant';

export interface ExchangeCodeResult {
    googleSub: string;
    refreshToken: string;
}

interface GoogleTokenResponse {
    access_token?: string;
    refresh_token?: string;
    id_token?: string;
    error?: string;
    error_description?: string;
}

export async function exchangeAuthorizationCode(
    clientId: string,
    clientSecret: string,
    code: string
): Promise<ExchangeCodeResult> {
    const response = await postToGoogle({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        // postmessage is the special redirect_uri used by Google Identity Services
        // popup-mode auth code flow (matches the value the SDK sends from the browser).
        redirect_uri: 'postmessage',
    });

    if (!response.id_token || !response.refresh_token) {
        throw new GoogleAuthError(
            'Google did not return an id_token or refresh_token. Ensure the OAuth client is configured for offline access.'
        );
    }

    const sub = await verifyIdTokenSub(clientId, response.id_token);
    return { googleSub: sub, refreshToken: response.refresh_token };
}

export async function isGoogleRefreshTokenValid(
    clientId: string,
    clientSecret: string,
    refreshToken: string
): Promise<boolean> {
    try {
        await postToGoogle({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
        });
        return true;
    } catch (error) {
        if (error instanceof GoogleAuthError && error.googleError === GOOGLE_INVALID_GRANT) {
            return false;
        }
        throw error;
    }
}

export class GoogleAuthError extends Error {
    constructor(
        message: string,
        public readonly googleError?: string
    ) {
        super(message);
        this.name = 'GoogleAuthError';
    }
}

async function postToGoogle(form: Record<string, string>): Promise<GoogleTokenResponse> {
    const body = new URLSearchParams(form);
    const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
    });
    const json = (await res.json().catch(() => ({}))) as GoogleTokenResponse;
    if (!res.ok) {
        throw new GoogleAuthError(
            json.error_description ?? json.error ?? `Google token endpoint returned ${res.status}`,
            json.error
        );
    }
    return json;
}

async function verifyIdTokenSub(clientId: string, idToken: string): Promise<string> {
    const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
        issuer: GOOGLE_ISSUERS,
        audience: clientId,
        algorithms: ['RS256'],
    });
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
        throw new GoogleAuthError('Google id_token is missing the sub claim');
    }
    return payload.sub;
}
