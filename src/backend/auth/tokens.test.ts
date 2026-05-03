import { describe, expect, it } from 'vitest';
import {
    ACCESS_TOKEN_TTL_SECONDS,
    signAccessToken,
    signRefreshToken,
    verifyAccessToken,
    verifyRefreshToken,
} from './tokens';

const SECRET = 'unit-test-secret-must-be-long-enough-for-hs256';

describe('auth tokens', () => {
    function now(): number {
        return Math.floor(Date.now() / 1000);
    }

    it('round-trips an access token', async () => {
        const token = await signAccessToken(SECRET, { sub: 'u1', sid: 's1' }, now());
        const claims = await verifyAccessToken(SECRET, token);
        expect(claims).toEqual({ sub: 'u1', sid: 's1' });
    });

    it('round-trips a refresh token', async () => {
        const token = await signRefreshToken(SECRET, { sub: 'u2', sid: 's2' }, now());
        const claims = await verifyRefreshToken(SECRET, token);
        expect(claims).toEqual({ sub: 'u2', sid: 's2' });
    });

    it('rejects access token verification with the wrong secret', async () => {
        const token = await signAccessToken(SECRET, { sub: 'u1', sid: 's1' }, now());
        await expect(verifyAccessToken('wrong-secret', token)).rejects.toThrow();
    });

    it('rejects when an access token is presented as a refresh token', async () => {
        const token = await signAccessToken(SECRET, { sub: 'u1', sid: 's1' }, now());
        await expect(verifyRefreshToken(SECRET, token)).rejects.toThrow();
    });

    it('rejects when a refresh token is presented as an access token', async () => {
        const token = await signRefreshToken(SECRET, { sub: 'u1', sid: 's1' }, now());
        await expect(verifyAccessToken(SECRET, token)).rejects.toThrow();
    });

    it('rejects an expired access token', async () => {
        const issued = Math.floor(Date.now() / 1000) - ACCESS_TOKEN_TTL_SECONDS - 60;
        const token = await signAccessToken(SECRET, { sub: 'u1', sid: 's1' }, issued);
        await expect(verifyAccessToken(SECRET, token)).rejects.toThrow();
    });

    it('refresh tokens have no exp and remain verifiable years later', async () => {
        const longAgo = 1_500_000_000; // 2017-ish
        const token = await signRefreshToken(SECRET, { sub: 'u1', sid: 's1' }, longAgo);
        const claims = await verifyRefreshToken(SECRET, token);
        expect(claims.sid).toBe('s1');
    });
});
