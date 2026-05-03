import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../env';
import { visitsRouter } from './visits';

vi.mock('../db/visits', () => ({
    listVisits: vi.fn(),
    upsertVisit: vi.fn(),
    deleteVisit: vi.fn(),
}));

import * as visitsDb from '../db/visits';

const TEST_ENV = {
    DB: {} as unknown as AppEnv['Bindings']['DB'],
    GOOGLE_CLIENT_ID: 'test-client',
    GOOGLE_CLIENT_SECRET: 'test-secret',
    SESSION_JWT_SECRET: 'test-session-secret',
    ALLOWED_ORIGINS: 'http://localhost:8081',
};

function buildApp(user: { sub: string } = { sub: 'user-1' }): Hono<AppEnv> {
    const app = new Hono<AppEnv>();
    app.use('*', async (c, next) => {
        c.set('user', user);
        await next();
    });
    app.route('/visits', visitsRouter);
    return app;
}

describe('visits handlers', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    describe('GET /visits', () => {
        it('returns the visits for the authenticated user', async () => {
            vi.mocked(visitsDb.listVisits).mockResolvedValue([
                { stationId: '123', styleId: 1, updatedAt: 1000 },
                { stationId: '456', styleId: 2, updatedAt: 2000 },
            ]);

            const res = await buildApp().request('/visits', {}, TEST_ENV);

            expect(res.status).toBe(200);
            expect(await res.json()).toEqual({
                visits: [
                    { stationId: '123', styleId: 1, updatedAt: 1000 },
                    { stationId: '456', styleId: 2, updatedAt: 2000 },
                ],
            });
            expect(visitsDb.listVisits).toHaveBeenCalledWith(TEST_ENV.DB, 'user-1');
        });
    });

    describe('PUT /visits/:stationId', () => {
        it('upserts a single visit', async () => {
            const res = await buildApp().request(
                '/visits/123',
                {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ styleId: 2 }),
                },
                TEST_ENV
            );

            expect(res.status).toBe(204);
            expect(visitsDb.upsertVisit).toHaveBeenCalledWith(
                TEST_ENV.DB,
                'user-1',
                '123',
                2,
                expect.any(Number)
            );
        });

        it('rejects a non-numeric station id', async () => {
            const res = await buildApp().request(
                '/visits/abc',
                {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ styleId: 2 }),
                },
                TEST_ENV
            );

            expect(res.status).toBe(400);
            expect(visitsDb.upsertVisit).not.toHaveBeenCalled();
        });

        it('rejects an out-of-range style id', async () => {
            const res = await buildApp().request(
                '/visits/123',
                {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ styleId: 5 }),
                },
                TEST_ENV
            );

            expect(res.status).toBe(400);
            expect(visitsDb.upsertVisit).not.toHaveBeenCalled();
        });

        it('rejects style id 0 (used as the unset sentinel client-side)', async () => {
            const res = await buildApp().request(
                '/visits/123',
                {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ styleId: 0 }),
                },
                TEST_ENV
            );

            expect(res.status).toBe(400);
            expect(visitsDb.upsertVisit).not.toHaveBeenCalled();
        });

        it('rejects a malformed JSON body', async () => {
            const res = await buildApp().request(
                '/visits/123',
                {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: '{ not json',
                },
                TEST_ENV
            );

            expect(res.status).toBe(400);
            expect(visitsDb.upsertVisit).not.toHaveBeenCalled();
        });
    });

    describe('DELETE /visits/:stationId', () => {
        it('deletes the visit', async () => {
            const res = await buildApp().request(
                '/visits/123',
                { method: 'DELETE' },
                TEST_ENV
            );

            expect(res.status).toBe(204);
            expect(visitsDb.deleteVisit).toHaveBeenCalledWith(TEST_ENV.DB, 'user-1', '123');
        });

        it('rejects a non-numeric station id', async () => {
            const res = await buildApp().request(
                '/visits/abc',
                { method: 'DELETE' },
                TEST_ENV
            );

            expect(res.status).toBe(400);
            expect(visitsDb.deleteVisit).not.toHaveBeenCalled();
        });
    });

});
