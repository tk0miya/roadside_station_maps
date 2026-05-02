import type { AuthUser } from '../../shared/auth-types';

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

interface IdTokenHeader {
    alg: string;
    kid: string;
    typ?: string;
}

interface IdTokenPayload {
    sub?: string;
    iss?: string;
    aud?: string | string[];
    exp?: number;
    iat?: number;
}

interface Jwk {
    kid: string;
    kty: string;
    alg?: string;
    n: string;
    e: string;
    use?: string;
}

interface JwksResponse {
    keys: Jwk[];
}

interface CachedKeys {
    keys: Map<string, CryptoKey>;
    expiresAt: number;
}

let cache: CachedKeys | null = null;

export interface VerifyIdTokenOptions {
    clientId: string;
    issuers?: readonly string[];
    nowSeconds?: number;
    fetchImpl?: typeof fetch;
}

export async function verifyIdToken(token: string, options: VerifyIdTokenOptions): Promise<AuthUser> {
    const { header, payload, signature, signedData } = parseJwt(token);

    if (header.alg !== 'RS256') {
        throw new Error(`Unsupported JWT algorithm: ${header.alg}`);
    }

    const key = await getPublicKey(header.kid, options.fetchImpl ?? fetch);
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, signedData);
    if (!valid) {
        throw new Error('Invalid JWT signature');
    }

    verifyClaims(payload, options);
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
        throw new Error('ID token is missing the sub claim');
    }
    return { sub: payload.sub };
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

interface ParsedJwt {
    header: IdTokenHeader;
    payload: IdTokenPayload;
    signature: ArrayBuffer;
    signedData: ArrayBuffer;
}

function parseJwt(token: string): ParsedJwt {
    const parts = token.split('.');
    if (parts.length !== 3) {
        throw new Error('Malformed JWT');
    }
    const [headerSegment, payloadSegment, signatureSegment] = parts;
    const header = JSON.parse(decodeBase64UrlToString(headerSegment)) as IdTokenHeader;
    const payload = JSON.parse(decodeBase64UrlToString(payloadSegment)) as IdTokenPayload;
    const signature = decodeBase64Url(signatureSegment);
    const signedData = new TextEncoder().encode(`${headerSegment}.${payloadSegment}`).buffer as ArrayBuffer;
    return { header, payload, signature, signedData };
}

async function getPublicKey(kid: string, fetchImpl: typeof fetch): Promise<CryptoKey> {
    const now = Date.now();
    if (!cache || cache.expiresAt <= now) {
        cache = await fetchJwks(fetchImpl);
    }
    const key = cache.keys.get(kid);
    if (!key) {
        // Refresh once in case the key was just rotated.
        cache = await fetchJwks(fetchImpl);
        const refreshed = cache.keys.get(kid);
        if (!refreshed) {
            throw new Error(`Unknown JWT key id: ${kid}`);
        }
        return refreshed;
    }
    return key;
}

async function fetchJwks(fetchImpl: typeof fetch): Promise<CachedKeys> {
    const response = await fetchImpl(GOOGLE_JWKS_URL, { cf: { cacheTtl: 3600 } } as RequestInit);
    if (!response.ok) {
        throw new Error(`Failed to fetch JWKS: ${response.status}`);
    }
    const body = (await response.json()) as JwksResponse;
    const keys = new Map<string, CryptoKey>();
    for (const jwk of body.keys) {
        const key = await crypto.subtle.importKey(
            'jwk',
            jwk as JsonWebKey,
            { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
            false,
            ['verify']
        );
        keys.set(jwk.kid, key);
    }

    const cacheControl = response.headers.get('cache-control') ?? '';
    const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
    const maxAge = maxAgeMatch ? Number.parseInt(maxAgeMatch[1], 10) : 3600;
    return { keys, expiresAt: Date.now() + maxAge * 1000 };
}

function decodeBase64UrlToString(input: string): string {
    const buffer = decodeBase64Url(input);
    return new TextDecoder().decode(buffer);
}

function decodeBase64Url(input: string): ArrayBuffer {
    const padded = input.replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (padded.length % 4)) % 4;
    const base64 = padded + '='.repeat(padLen);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

// Exposed for tests to reset the JWKS cache between cases.
export function resetJwksCacheForTests(): void {
    cache = null;
}
