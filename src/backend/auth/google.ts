import * as oidc from 'openid-client';

const GOOGLE_ISSUER = new URL('https://accounts.google.com');
// Used by Google Identity Services popup-mode auth-code flow. The frontend
// SDK sends the same value when initiating the authorization request, so the
// token endpoint will reject anything else.
const POPUP_REDIRECT_URI = 'postmessage';

export interface ExchangeCodeResult {
    googleSub: string;
    refreshToken: string;
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

// Module-level cache: Workers can reuse the discovered Configuration for the
// lifetime of the isolate, so we avoid repeating the well-known fetch.
let configCache: Promise<oidc.Configuration> | null = null;

function getConfig(clientId: string, clientSecret: string): Promise<oidc.Configuration> {
    if (!configCache) {
        configCache = oidc.discovery(GOOGLE_ISSUER, clientId, clientSecret);
    }
    return configCache;
}

export async function exchangeAuthorizationCode(
    clientId: string,
    clientSecret: string,
    code: string
): Promise<ExchangeCodeResult> {
    const config = await getConfig(clientId, clientSecret);

    // openid-client expects to read the code from a callback URL. The popup
    // flow has no real redirect, so we synthesize one with just the code.
    const callbackUrl = new URL('http://localhost/callback');
    callbackUrl.searchParams.set('code', code);

    let tokens: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers;
    try {
        tokens = await oidc.authorizationCodeGrant(
            config,
            callbackUrl,
            // No PKCE/state checks: popup mode runs entirely in-memory in the SDK.
            { expectedState: oidc.skipStateCheck },
            { redirect_uri: POPUP_REDIRECT_URI }
        );
    } catch (error) {
        throw toGoogleAuthError(error, 'Failed to exchange authorization code');
    }

    if (!tokens.refresh_token) {
        throw new GoogleAuthError(
            'Google did not return a refresh_token. Ensure the OAuth client requests offline access.'
        );
    }
    const claims = tokens.claims();
    if (!claims || typeof claims.sub !== 'string' || claims.sub.length === 0) {
        throw new GoogleAuthError('Google id_token is missing the sub claim');
    }
    return { googleSub: claims.sub, refreshToken: tokens.refresh_token };
}

export async function isGoogleRefreshTokenValid(
    clientId: string,
    clientSecret: string,
    refreshToken: string
): Promise<boolean> {
    const config = await getConfig(clientId, clientSecret);
    try {
        await oidc.refreshTokenGrant(config, refreshToken);
        return true;
    } catch (error) {
        if (isInvalidGrant(error)) return false;
        throw toGoogleAuthError(error, 'Failed to refresh Google token');
    }
}

function isInvalidGrant(error: unknown): boolean {
    return error instanceof oidc.ResponseBodyError && error.error === 'invalid_grant';
}

function toGoogleAuthError(error: unknown, fallback: string): GoogleAuthError {
    if (error instanceof oidc.ResponseBodyError) {
        return new GoogleAuthError(error.error_description ?? error.error ?? fallback, error.error);
    }
    if (error instanceof Error) return new GoogleAuthError(error.message);
    return new GoogleAuthError(fallback);
}
