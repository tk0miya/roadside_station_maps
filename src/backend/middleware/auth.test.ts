import { describe, expect, it } from 'vitest';
import { buildTestApp, TEST_ENV } from '@test-utils/backend';
import { issueSessionToken } from '../auth/session';
import { requireAuth } from './auth';

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
});
