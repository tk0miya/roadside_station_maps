import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApp, TEST_ENV } from '@test-utils/backend';
import { GoogleAuthError } from '../auth/google';
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
