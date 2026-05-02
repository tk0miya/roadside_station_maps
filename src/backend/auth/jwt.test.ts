import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetJwksCacheForTests, verifyIdToken } from './jwt';

const CLIENT_ID = 'test-client';
const KID = 'test-kid';

type Jwk = JsonWebKey & { kid?: string; alg?: string; use?: string };

interface Keys {
    publicKey: CryptoKey;
    privateKey: CryptoKey;
    publicJwk: Jwk;
}

async function generateKeys(): Promise<Keys> {
    const pair = (await crypto.subtle.generateKey(
        {
            name: 'RSASSA-PKCS1-v1_5',
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: 'SHA-256',
        },
        true,
        ['sign', 'verify']
    )) as CryptoKeyPair;
    const publicJwk = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as Jwk;
    publicJwk.kid = KID;
    publicJwk.alg = 'RS256';
    publicJwk.use = 'sig';
    return { publicKey: pair.publicKey, privateKey: pair.privateKey, publicJwk };
}

function base64UrlEncode(input: string | Uint8Array): string {
    const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
    let binary = '';
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function signJwt(privateKey: CryptoKey, payload: Record<string, unknown>): Promise<string> {
    const header = { alg: 'RS256', kid: KID, typ: 'JWT' };
    const headerSegment = base64UrlEncode(JSON.stringify(header));
    const payloadSegment = base64UrlEncode(JSON.stringify(payload));
    const signingInput = `${headerSegment}.${payloadSegment}`;
    const signature = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        privateKey,
        new TextEncoder().encode(signingInput)
    );
    const signatureSegment = base64UrlEncode(new Uint8Array(signature));
    return `${signingInput}.${signatureSegment}`;
}

function buildJwksFetch(jwk: Jwk): typeof fetch {
    return ((_input: RequestInfo | URL, _init?: RequestInit) => {
        return Promise.resolve(
            new Response(JSON.stringify({ keys: [jwk] }), {
                status: 200,
                headers: { 'content-type': 'application/json', 'cache-control': 'max-age=3600' },
            })
        );
    }) as typeof fetch;
}

describe('verifyIdToken (backend)', () => {
    let keys: Keys;
    const validPayload = (): Record<string, unknown> => ({
        sub: 'user-1',
        iss: 'https://accounts.google.com',
        aud: CLIENT_ID,
        exp: 2_000_000_000,
    });

    beforeEach(async () => {
        keys = await generateKeys();
        resetJwksCacheForTests();
    });

    afterEach(() => {
        resetJwksCacheForTests();
    });

    it('returns the AuthUser for a validly signed token', async () => {
        const token = await signJwt(keys.privateKey, validPayload());
        const result = await verifyIdToken(token, {
            clientId: CLIENT_ID,
            nowSeconds: 1_000_000_000,
            fetchImpl: buildJwksFetch(keys.publicJwk),
        });
        expect(result).toEqual({ sub: 'user-1' });
    });

    it('rejects tokens signed by a different key', async () => {
        const otherKeys = await generateKeys();
        const token = await signJwt(otherKeys.privateKey, validPayload());
        await expect(
            verifyIdToken(token, {
                clientId: CLIENT_ID,
                nowSeconds: 1_000_000_000,
                fetchImpl: buildJwksFetch(keys.publicJwk),
            })
        ).rejects.toThrow(/signature/);
    });

    it('rejects malformed tokens', async () => {
        await expect(
            verifyIdToken('not-a-jwt', {
                clientId: CLIENT_ID,
                fetchImpl: buildJwksFetch(keys.publicJwk),
            })
        ).rejects.toThrow(/Malformed/);
    });

    it('rejects tokens with the wrong issuer', async () => {
        const token = await signJwt(keys.privateKey, { ...validPayload(), iss: 'https://evil.example' });
        await expect(
            verifyIdToken(token, {
                clientId: CLIENT_ID,
                nowSeconds: 1_000_000_000,
                fetchImpl: buildJwksFetch(keys.publicJwk),
            })
        ).rejects.toThrow(/issuer/);
    });

    it('rejects tokens with the wrong audience', async () => {
        const token = await signJwt(keys.privateKey, { ...validPayload(), aud: 'other-client' });
        await expect(
            verifyIdToken(token, {
                clientId: CLIENT_ID,
                nowSeconds: 1_000_000_000,
                fetchImpl: buildJwksFetch(keys.publicJwk),
            })
        ).rejects.toThrow(/audience/);
    });

    it('rejects expired tokens', async () => {
        const token = await signJwt(keys.privateKey, { ...validPayload(), exp: 500 });
        await expect(
            verifyIdToken(token, {
                clientId: CLIENT_ID,
                nowSeconds: 1_000_000_000,
                fetchImpl: buildJwksFetch(keys.publicJwk),
            })
        ).rejects.toThrow(/expired/);
    });

    it('rejects tokens missing the sub claim', async () => {
        const payload = validPayload();
        delete (payload as { sub?: string }).sub;
        const token = await signJwt(keys.privateKey, payload);
        await expect(
            verifyIdToken(token, {
                clientId: CLIENT_ID,
                nowSeconds: 1_000_000_000,
                fetchImpl: buildJwksFetch(keys.publicJwk),
            })
        ).rejects.toThrow(/sub claim/);
    });

    it('accepts the bare-host issuer', async () => {
        const token = await signJwt(keys.privateKey, { ...validPayload(), iss: 'accounts.google.com' });
        const result = await verifyIdToken(token, {
            clientId: CLIENT_ID,
            nowSeconds: 1_000_000_000,
            fetchImpl: buildJwksFetch(keys.publicJwk),
        });
        expect(result).toEqual({ sub: 'user-1' });
    });
});
