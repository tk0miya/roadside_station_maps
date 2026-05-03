import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { buildTestApp, TEST_ENV } from '@test-utils/backend';
import { issueSessionToken } from '../auth/session';
import { requireAuth, SESSION_EXPIRES_AT_HEADER, SESSION_TOKEN_HEADER } from './auth';

const SECRET = TEST_ENV.SESSION_SECRET;

const buildApp = () =>
    buildTestApp((app) => {
        app.use('*', requireAuth());
        app.get('/echo', (c) => c.json({ sub: c.get('user').sub }));
    }, null);

const sendBearer = (token: string | null, env: typeof TEST_ENV = TEST_ENV) => {
    const headers: Record<string, string> = {};
    if (token !== null) {
        headers.Authorization = `Bearer ${token}`;
    }
    return buildApp().request('/echo', { headers }, env);
};

describe('requireAuth middleware', () => {
    describe('rejection cases', () => {
        it('returns 401 when the Authorization header is missing', async () => {
            const res = await sendBearer(null);
            expect(res.status).toBe(401);
        });

        it('returns 401 when the Authorization scheme is not Bearer', async () => {
            const res = await buildApp().request(
                '/echo',
                { headers: { Authorization: 'Basic abc' } },
                TEST_ENV,
            );
            expect(res.status).toBe(401);
        });

        it('returns 401 when the token is malformed', async () => {
            const res = await sendBearer('not-a-jwt');
            expect(res.status).toBe(401);
        });

        it('returns 401 when the token is signed with a different secret', async () => {
            const { token } = await issueSessionToken('user-1', 'other-secret');
            const res = await sendBearer(token);
            expect(res.status).toBe(401);
        });

        it('returns 500 when SESSION_SECRET is not configured', async () => {
            const { token } = await issueSessionToken('user-1', SECRET);
            const res = await sendBearer(token, { ...TEST_ENV, SESSION_SECRET: '' });
            expect(res.status).toBe(500);
        });
    });

    describe('success cases', () => {
        it('passes through and exposes the user sub to the handler', async () => {
            const { token } = await issueSessionToken('user-42', SECRET);
            const res = await sendBearer(token);
            expect(res.status).toBe(200);
            expect(await res.json()).toEqual({ sub: 'user-42' });
        });
    });

    describe('sliding rotation', () => {
        const ISSUER = 'roadside-station-maps';
        const AUDIENCE = 'roadside-station-maps-frontend';

        const mintTokenExpiringIn = async (sub: string, secondsFromNow: number): Promise<string> => {
            const expiresAt = Math.floor(Date.now() / 1000) + secondsFromNow;
            return new SignJWT({})
                .setProtectedHeader({ alg: 'HS256' })
                .setSubject(sub)
                .setIssuer(ISSUER)
                .setAudience(AUDIENCE)
                .setIssuedAt()
                .setExpirationTime(expiresAt)
                .sign(new TextEncoder().encode(SECRET));
        };

        it('does not rotate when remaining lifetime is well above the threshold', async () => {
            const { token } = await issueSessionToken('user-1', SECRET);
            const res = await sendBearer(token);
            expect(res.headers.get(SESSION_TOKEN_HEADER)).toBeNull();
            expect(res.headers.get(SESSION_EXPIRES_AT_HEADER)).toBeNull();
        });

        it('rotates when remaining lifetime is below 30 days', async () => {
            const tenDays = 60 * 60 * 24 * 10;
            const oldToken = await mintTokenExpiringIn('user-7', tenDays);
            const res = await sendBearer(oldToken);

            expect(res.status).toBe(200);
            const newToken = res.headers.get(SESSION_TOKEN_HEADER);
            expect(newToken).toBeTruthy();
            expect(newToken).not.toBe(oldToken);

            const newExp = res.headers.get(SESSION_EXPIRES_AT_HEADER);
            expect(newExp).toBeTruthy();
            expect(Number(newExp)).toBeGreaterThan(Math.floor(Date.now() / 1000) + tenDays);
        });
    });
});
