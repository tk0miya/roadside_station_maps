import { SignJWT, jwtVerify } from 'jose';

const SESSION_ISSUER = 'roadside-station-maps';
const SESSION_AUDIENCE = 'roadside-station-maps-frontend';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 365;
const SESSION_ALGORITHM = 'HS256';

// Sessions are eligible for refresh once their remaining lifetime drops below
// half of the TTL. Refreshing early keeps active users from ever bumping into
// the hard expiry: as long as they return within the first half of the
// session's lifetime, the token gets renewed.
export const SESSION_REFRESH_THRESHOLD_SECONDS = SESSION_TTL_SECONDS / 2;

export interface SessionToken {
    token: string;
    expiresAt: number;
}

export interface SessionPayload {
    sub: string;
    exp: number;
}

export class SessionTokenError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SessionTokenError';
    }
}

export async function issueSessionToken(sub: string, secret: string): Promise<SessionToken> {
    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAt = issuedAt + SESSION_TTL_SECONDS;

    const token = await new SignJWT({})
        .setProtectedHeader({ alg: SESSION_ALGORITHM })
        .setSubject(sub)
        .setIssuer(SESSION_ISSUER)
        .setAudience(SESSION_AUDIENCE)
        .setIssuedAt(issuedAt)
        .setExpirationTime(expiresAt)
        .sign(toKey(secret));

    return { token, expiresAt };
}

export async function verifySessionToken(token: string, secret: string): Promise<SessionPayload> {
    const { payload } = await jwtVerify(token, toKey(secret), {
        issuer: SESSION_ISSUER,
        audience: SESSION_AUDIENCE,
        algorithms: [SESSION_ALGORITHM],
    });

    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
        throw new SessionTokenError('Session token is missing the sub claim');
    }
    if (typeof payload.exp !== 'number') {
        throw new SessionTokenError('Session token is missing the exp claim');
    }

    return { sub: payload.sub, exp: payload.exp };
}

function toKey(secret: string): Uint8Array {
    return new TextEncoder().encode(secret);
}
