import { jwtDecode } from 'jwt-decode';
import type { AuthUser } from './types';

interface IdTokenPayload {
    sub?: string;
    iss?: string;
    aud?: string | string[];
    exp?: number;
}

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

export interface VerifyIdTokenOptions {
    clientId: string;
    issuers?: readonly string[];
    nowSeconds?: number;
}

export function verifyIdToken(token: string, options: VerifyIdTokenOptions): AuthUser {
    const payload = jwtDecode<IdTokenPayload>(token);
    verifyClaims(payload, options);
    return toAuthUser(payload);
}

function verifyClaims(payload: IdTokenPayload, options: VerifyIdTokenOptions): void {
    const { clientId, issuers = GOOGLE_ISSUERS, nowSeconds = Math.floor(Date.now() / 1000) } = options;

    if (typeof payload.iss !== 'string' || !issuers.includes(payload.iss)) {
        throw new Error(`Invalid ID token issuer: ${String(payload.iss)}`);
    }

    const audMatches = Array.isArray(payload.aud) ? payload.aud.includes(clientId) : payload.aud === clientId;
    if (!audMatches) {
        throw new Error(`Invalid ID token audience: ${String(payload.aud)}`);
    }

    if (typeof payload.exp !== 'number' || payload.exp <= nowSeconds) {
        throw new Error('ID token is expired');
    }
}

function toAuthUser(payload: IdTokenPayload): AuthUser {
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
        throw new Error('ID token is missing the sub claim');
    }
    return { sub: payload.sub };
}
