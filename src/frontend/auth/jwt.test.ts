import { describe, expect, it } from 'vitest';
import { verifyIdToken } from './jwt';

function base64UrlEncode(input: string): string {
    return Buffer.from(input, 'utf8').toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function buildIdToken(payload: Record<string, unknown>): string {
    const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const body = base64UrlEncode(JSON.stringify(payload));
    return `${header}.${body}.sig`;
}

describe('verifyIdToken', () => {
    const CLIENT_ID = 'my-client-id';
    const validPayload = {
        sub: 'user-1',
        iss: 'https://accounts.google.com',
        aud: CLIENT_ID,
        exp: 2000,
    };

    it('returns the AuthUser for a valid token', () => {
        const token = buildIdToken(validPayload);
        expect(verifyIdToken(token, { clientId: CLIENT_ID, nowSeconds: 1000 })).toEqual({ sub: 'user-1' });
    });

    it('accepts the bare-host issuer', () => {
        const token = buildIdToken({ ...validPayload, iss: 'accounts.google.com' });
        expect(verifyIdToken(token, { clientId: CLIENT_ID, nowSeconds: 1000 })).toEqual({ sub: 'user-1' });
    });

    it('accepts an audience array that includes the client id', () => {
        const token = buildIdToken({ ...validPayload, aud: ['other', CLIENT_ID] });
        expect(verifyIdToken(token, { clientId: CLIENT_ID, nowSeconds: 1000 })).toEqual({ sub: 'user-1' });
    });

    it('throws on a malformed token', () => {
        expect(() => verifyIdToken('not-a-jwt', { clientId: CLIENT_ID })).toThrow();
    });

    it('throws when the issuer does not match', () => {
        const token = buildIdToken({ ...validPayload, iss: 'https://evil.example' });
        expect(() => verifyIdToken(token, { clientId: CLIENT_ID, nowSeconds: 1000 })).toThrow(/issuer/);
    });

    it('throws when the audience does not match', () => {
        const token = buildIdToken(validPayload);
        expect(() => verifyIdToken(token, { clientId: 'other-client', nowSeconds: 1000 })).toThrow(/audience/);
    });

    it('throws when the token is expired', () => {
        const token = buildIdToken({ ...validPayload, exp: 500 });
        expect(() => verifyIdToken(token, { clientId: CLIENT_ID, nowSeconds: 1000 })).toThrow(/expired/);
    });

    it('throws when exp is missing', () => {
        const token = buildIdToken({ sub: 'x', iss: 'https://accounts.google.com', aud: CLIENT_ID });
        expect(() => verifyIdToken(token, { clientId: CLIENT_ID, nowSeconds: 1000 })).toThrow(/expired/);
    });

    it('throws when sub is missing', () => {
        const token = buildIdToken({ iss: 'https://accounts.google.com', aud: CLIENT_ID, exp: 9999999999 });
        expect(() => verifyIdToken(token, { clientId: CLIENT_ID, nowSeconds: 1000 })).toThrow(/sub claim/);
    });
});
