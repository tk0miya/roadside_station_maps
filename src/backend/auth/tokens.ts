import { SignJWT, jwtVerify } from 'jose';

const ACCESS_TOKEN_AUDIENCE = 'api';
const REFRESH_TOKEN_AUDIENCE = 'refresh';
const ISSUER = 'roadside-station-maps';
export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour

export interface AccessTokenClaims {
    sub: string;
    sid: string;
}

export interface RefreshTokenClaims {
    sub: string;
    sid: string;
}

function getKey(secret: string): Uint8Array {
    return new TextEncoder().encode(secret);
}

export async function signAccessToken(
    secret: string,
    claims: AccessTokenClaims,
    nowSeconds: number
): Promise<string> {
    return new SignJWT({ sid: claims.sid })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(claims.sub)
        .setIssuer(ISSUER)
        .setAudience(ACCESS_TOKEN_AUDIENCE)
        .setIssuedAt(nowSeconds)
        .setExpirationTime(nowSeconds + ACCESS_TOKEN_TTL_SECONDS)
        .sign(getKey(secret));
}

export async function signRefreshToken(
    secret: string,
    claims: RefreshTokenClaims,
    nowSeconds: number
): Promise<string> {
    // Refresh token has no `exp`; idle expiration is enforced server-side via
    // the sessions table (see /auth/refresh handler).
    return new SignJWT({ sid: claims.sid })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(claims.sub)
        .setIssuer(ISSUER)
        .setAudience(REFRESH_TOKEN_AUDIENCE)
        .setIssuedAt(nowSeconds)
        .sign(getKey(secret));
}

export async function verifyAccessToken(
    secret: string,
    token: string
): Promise<AccessTokenClaims> {
    const { payload } = await jwtVerify(token, getKey(secret), {
        algorithms: ['HS256'],
        issuer: ISSUER,
        audience: ACCESS_TOKEN_AUDIENCE,
    });
    return extractClaims(payload);
}

export async function verifyRefreshToken(
    secret: string,
    token: string
): Promise<RefreshTokenClaims> {
    const { payload } = await jwtVerify(token, getKey(secret), {
        algorithms: ['HS256'],
        issuer: ISSUER,
        audience: REFRESH_TOKEN_AUDIENCE,
    });
    return extractClaims(payload);
}

function extractClaims(payload: { sub?: string; sid?: unknown }): AccessTokenClaims {
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
        throw new Error('Token is missing sub claim');
    }
    if (typeof payload.sid !== 'string' || payload.sid.length === 0) {
        throw new Error('Token is missing sid claim');
    }
    return { sub: payload.sub, sid: payload.sid };
}
