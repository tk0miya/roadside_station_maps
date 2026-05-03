import { SignJWT } from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApp, TEST_ENV } from '@test-utils/backend';
import { GoogleAuthError } from '../auth/google';
import { issueSessionToken, verifySessionToken } from '../auth/session';
import { sessionsRouter } from './sessions';

vi.mock('../auth/google', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../auth/google')>();
    return {
        ...actual,
        verifyIdToken: vi.fn(),
    };
});

import * as google from '../auth/google';

const buildApp = () => buildTestApp((app) => app.route('/sessions', sessionsRouter), null);

const post = (body: unknown, env: typeof TEST_ENV = TEST_ENV) =>
    buildApp().request(
        '/sessions',
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        },
        env,
    );

describe('POST /sessions', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    describe('validation', () => {
        it('returns 500 when SESSION_SECRET is not configured', async () => {
            const res = await post({ provider: 'google', idToken: 'tok' }, { ...TEST_ENV, SESSION_SECRET: '' });
            expect(res.status).toBe(500);
            expect(google.verifyIdToken).not.toHaveBeenCalled();
        });

        it('returns 400 when the provider field is missing', async () => {
            const res = await post({ idToken: 'tok' });
            expect(res.status).toBe(400);
            expect(google.verifyIdToken).not.toHaveBeenCalled();
        });

        it('returns 400 when the provider is unsupported', async () => {
            const res = await post({ provider: 'apple', idToken: 'tok' });
            expect(res.status).toBe(400);
            expect(google.verifyIdToken).not.toHaveBeenCalled();
        });

        it('returns 400 when idToken is missing', async () => {
            const res = await post({ provider: 'google' });
            expect(res.status).toBe(400);
            expect(google.verifyIdToken).not.toHaveBeenCalled();
        });

        it('returns 400 when the body is not valid JSON', async () => {
            const res = await buildApp().request(
                '/sessions',
                { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'not-json' },
                TEST_ENV,
            );
            expect(res.status).toBe(400);
            expect(google.verifyIdToken).not.toHaveBeenCalled();
        });
    });

    describe('Google verification failures', () => {
        it('forwards GoogleAuthError with status 401', async () => {
            vi.mocked(google.verifyIdToken).mockRejectedValue(new GoogleAuthError('invalid', 401));
            const res = await post({ provider: 'google', idToken: 'tok' });
            expect(res.status).toBe(401);
        });

        it('forwards GoogleAuthError with status 502', async () => {
            vi.mocked(google.verifyIdToken).mockRejectedValue(new GoogleAuthError('upstream', 502));
            const res = await post({ provider: 'google', idToken: 'tok' });
            expect(res.status).toBe(502);
        });

        it('returns 401 when verifyIdToken throws an unexpected error', async () => {
            vi.mocked(google.verifyIdToken).mockRejectedValue(new Error('network down'));
            const res = await post({ provider: 'google', idToken: 'tok' });
            expect(res.status).toBe(401);
        });
    });

    describe('success', () => {
        it('returns 201 with a session token derived from the verified sub', async () => {
            vi.mocked(google.verifyIdToken).mockResolvedValue({ sub: 'user-7' });
            const res = await post({ provider: 'google', idToken: 'tok' });
            expect(res.status).toBe(201);
            const body = (await res.json()) as { sessionToken: string; expiresAt: number };
            expect(body.sessionToken).toEqual(expect.any(String));
            expect(body.sessionToken.split('.')).toHaveLength(3);
            expect(body.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
        });

        it('forwards the idToken and clientId to verifyIdToken', async () => {
            vi.mocked(google.verifyIdToken).mockResolvedValue({ sub: 'user-7' });
            await post({ provider: 'google', idToken: 'fancy-token' });
            expect(google.verifyIdToken).toHaveBeenCalledWith('fancy-token', TEST_ENV.GOOGLE_CLIENT_ID);
        });
    });
});

describe('POST /sessions/refresh', () => {
    const refresh = (token: string | null, env: typeof TEST_ENV = TEST_ENV) => {
        const headers: Record<string, string> = {};
        if (token !== null) {
            headers.Authorization = `Bearer ${token}`;
        }
        return buildApp().request('/sessions/refresh', { method: 'POST', headers }, env);
    };

    it('returns 401 when the Authorization header is missing', async () => {
        const res = await refresh(null);
        expect(res.status).toBe(401);
    });

    it('returns 401 when the bearer token is invalid', async () => {
        const res = await refresh('not-a-jwt');
        expect(res.status).toBe(401);
    });

    it('returns 401 when the bearer token was signed with a different secret', async () => {
        const { token } = await issueSessionToken('user-1', 'other-secret');
        const res = await refresh(token);
        expect(res.status).toBe(401);
    });

    it('returns 204 when the current token has plenty of remaining lifetime', async () => {
        const { token } = await issueSessionToken('user-9', TEST_ENV.SESSION_SECRET);
        const res = await refresh(token);

        expect(res.status).toBe(204);
        expect(await res.text()).toBe('');
    });

    it('issues a fresh session token when remaining lifetime is below the threshold', async () => {
        const tenDays = 60 * 60 * 24 * 10;
        const oldToken = await mintTokenExpiringIn('user-9', tenDays);
        const res = await refresh(oldToken);

        expect(res.status).toBe(200);
        const body = (await res.json()) as { sessionToken: string; expiresAt: number };
        expect(body.sessionToken).toEqual(expect.any(String));
        expect(body.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000) + tenDays);

        const payload = await verifySessionToken(body.sessionToken, TEST_ENV.SESSION_SECRET);
        expect(payload.sub).toBe('user-9');
        expect(payload.exp).toBe(body.expiresAt);
    });
});

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
        .sign(new TextEncoder().encode(TEST_ENV.SESSION_SECRET));
};
