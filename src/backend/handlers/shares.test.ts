import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApp, TEST_ENV } from '@test-utils/backend';
import { sharesAuthedRouter, sharesPublicRouter } from './shares';

vi.mock('../db/shares', () => ({
    getShareIdByUser: vi.fn(),
    getUserIdByShareId: vi.fn(),
    insertShare: vi.fn(),
}));
vi.mock('../db/visits', () => ({
    listVisits: vi.fn(),
}));

import * as sharesDb from '../db/shares';
import * as visitsDb from '../db/visits';

const buildAuthedApp = (user: { sub: string } = { sub: 'user-1' }) =>
    buildTestApp((app) => app.route('/shares', sharesAuthedRouter), user);

const buildPublicApp = () =>
    buildTestApp((app) => app.route('/shares', sharesPublicRouter), null);

describe('shares handlers', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    describe('POST /api/shares', () => {
        it('returns the existing share id when one already exists', async () => {
            vi.mocked(sharesDb.getShareIdByUser).mockResolvedValue('existing-share-id');

            const res = await buildAuthedApp().request(
                '/shares',
                { method: 'POST' },
                TEST_ENV
            );

            expect(res.status).toBe(200);
            expect(await res.json()).toEqual({ shareId: 'existing-share-id' });
            expect(sharesDb.insertShare).not.toHaveBeenCalled();
        });

        it('creates a new share id when none exists', async () => {
            vi.mocked(sharesDb.getShareIdByUser).mockResolvedValue(null);
            vi.spyOn(crypto, 'randomUUID').mockReturnValue(
                '11111111-2222-4333-8444-555555555555' as `${string}-${string}-${string}-${string}-${string}`
            );

            const res = await buildAuthedApp().request(
                '/shares',
                { method: 'POST' },
                TEST_ENV
            );

            expect(res.status).toBe(201);
            expect(await res.json()).toEqual({
                shareId: '11111111-2222-4333-8444-555555555555',
            });
            expect(sharesDb.insertShare).toHaveBeenCalledWith(
                TEST_ENV.DB,
                '11111111-2222-4333-8444-555555555555',
                'user-1',
                expect.any(Number)
            );
        });
    });

    describe('GET /shares/:shareId', () => {
        it('returns the visits for the share owner', async () => {
            vi.mocked(sharesDb.getUserIdByShareId).mockResolvedValue('user-1');
            vi.mocked(visitsDb.listVisits).mockResolvedValue([
                { stationId: '111', styleId: 1, updatedAt: 1000 },
            ]);

            const res = await buildPublicApp().request(
                '/shares/11111111-2222-4333-8444-555555555555',
                {},
                TEST_ENV
            );

            expect(res.status).toBe(200);
            expect(await res.json()).toEqual({
                visits: [{ stationId: '111', styleId: 1, updatedAt: 1000 }],
            });
            expect(visitsDb.listVisits).toHaveBeenCalledWith(TEST_ENV.DB, 'user-1');
        });

        it('rejects an invalid share id format', async () => {
            const res = await buildPublicApp().request('/shares/not-a-uuid', {}, TEST_ENV);

            expect(res.status).toBe(400);
            expect(sharesDb.getUserIdByShareId).not.toHaveBeenCalled();
        });

        it('returns 404 when the share id is unknown', async () => {
            vi.mocked(sharesDb.getUserIdByShareId).mockResolvedValue(null);

            const res = await buildPublicApp().request(
                '/shares/11111111-2222-4333-8444-555555555555',
                {},
                TEST_ENV
            );

            expect(res.status).toBe(404);
            expect(visitsDb.listVisits).not.toHaveBeenCalled();
        });
    });
});
