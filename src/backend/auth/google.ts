import { createRemoteJWKSet, jwtVerify } from 'jose';

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

export interface VerifyIdTokenResult {
    sub: string;
}

export class GoogleAuthError extends Error {
    constructor(
        message: string,
        readonly status: 401 | 502,
    ) {
        super(message);
        this.name = 'GoogleAuthError';
    }
}

export async function verifyIdToken(idToken: string, clientId: string): Promise<VerifyIdTokenResult> {
    try {
        const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
            issuer: GOOGLE_ISSUERS,
            audience: clientId,
            algorithms: ['RS256'],
        });

        if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
            throw new GoogleAuthError('Google id_token is missing the sub claim', 502);
        }

        return { sub: payload.sub };
    } catch (error) {
        if (error instanceof GoogleAuthError) {
            throw error;
        }
        const message = error instanceof Error ? error.message : 'Failed to verify Google id_token';
        throw new GoogleAuthError(message, 401);
    }
}
