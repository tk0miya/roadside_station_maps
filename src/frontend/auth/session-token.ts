import { decodeJwt } from 'jose';

export interface SessionTokenClaims {
    sub: string;
    exp: number;
}

// Client-side decode of the backend-issued session JWT. Signature verification
// is intentionally skipped: the token is HS256-signed with a server-only secret
// and the backend re-validates it on every authenticated request. The client
// only needs the claims for local UX decisions (current user, expiry).
export function decodeSessionToken(token: string): SessionTokenClaims | null {
    let payload: ReturnType<typeof decodeJwt>;
    try {
        payload = decodeJwt(token);
    } catch {
        return null;
    }

    if (typeof payload.sub !== 'string' || payload.sub.length === 0) return null;
    if (typeof payload.exp !== 'number') return null;

    return { sub: payload.sub, exp: payload.exp };
}

export function isSessionTokenExpired(claims: SessionTokenClaims, nowSeconds: number = Math.floor(Date.now() / 1000)): boolean {
    return claims.exp <= nowSeconds;
}
