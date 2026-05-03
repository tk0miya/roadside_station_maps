import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { TEST_ENV } from '@test-utils/backend';
import { issueSessionToken, SessionTokenError, verifySessionToken } from './session';

const SECRET = TEST_ENV.SESSION_SECRET;
const ISSUER = 'roadside-station-maps';
const AUDIENCE = 'roadside-station-maps-frontend';
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

const sign = (claims: (jwt: SignJWT) => SignJWT) =>
    claims(new SignJWT({}).setProtectedHeader({ alg: 'HS256' })).sign(new TextEncoder().encode(SECRET));

describe('issueSessionToken + verifySessionToken', () => {
    it('round-trips the sub claim', async () => {
        const { token } = await issueSessionToken('user-123', SECRET);
        const payload = await verifySessionToken(token, SECRET);
        expect(payload.sub).toBe('user-123');
    });

    it('issues a token whose exp is roughly one year in the future', async () => {
        const before = Math.floor(Date.now() / 1000);
        const { expiresAt } = await issueSessionToken('user-123', SECRET);
        const delta = expiresAt - before;
        expect(delta).toBeGreaterThanOrEqual(ONE_YEAR_SECONDS - 5);
        expect(delta).toBeLessThanOrEqual(ONE_YEAR_SECONDS + 5);
    });

    it('returns the same exp through verification as the issuer reports', async () => {
        const { token, expiresAt } = await issueSessionToken('user-123', SECRET);
        const payload = await verifySessionToken(token, SECRET);
        expect(payload.exp).toBe(expiresAt);
    });
});

describe('verifySessionToken failure modes', () => {
    it('rejects a token signed with a different secret', async () => {
        const { token } = await issueSessionToken('user-123', SECRET);
        await expect(verifySessionToken(token, 'different-secret')).rejects.toThrow();
    });

    it('rejects a malformed token', async () => {
        await expect(verifySessionToken('not.a.jwt', SECRET)).rejects.toThrow();
    });

    it('rejects an expired token', async () => {
        const past = Math.floor(Date.now() / 1000) - 10;
        const expired = await sign((jwt) =>
            jwt
                .setSubject('user-123')
                .setIssuer(ISSUER)
                .setAudience(AUDIENCE)
                .setIssuedAt(past - 60)
                .setExpirationTime(past),
        );
        await expect(verifySessionToken(expired, SECRET)).rejects.toThrow();
    });

    it('rejects a token signed for a different audience', async () => {
        const wrongAud = await sign((jwt) =>
            jwt
                .setSubject('user-123')
                .setIssuer(ISSUER)
                .setAudience('someone-else')
                .setIssuedAt()
                .setExpirationTime('1h'),
        );
        await expect(verifySessionToken(wrongAud, SECRET)).rejects.toThrow();
    });

    it('rejects a token without a sub claim', async () => {
        const noSub = await sign((jwt) =>
            jwt.setIssuer(ISSUER).setAudience(AUDIENCE).setIssuedAt().setExpirationTime('1h'),
        );
        await expect(verifySessionToken(noSub, SECRET)).rejects.toThrow(SessionTokenError);
    });

    it('rejects a token without an exp claim', async () => {
        const noExp = await sign((jwt) =>
            jwt.setSubject('user-123').setIssuer(ISSUER).setAudience(AUDIENCE).setIssuedAt(),
        );
        await expect(verifySessionToken(noExp, SECRET)).rejects.toThrow(SessionTokenError);
    });
});
