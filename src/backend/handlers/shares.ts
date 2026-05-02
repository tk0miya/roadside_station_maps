import { Hono } from 'hono';
import type { GetShareResponse, CreateShareResponse } from '@shared/api-types';
import { getShareIdByUser, getUserIdByShareId, insertShare } from '../db/shares';
import { listVisits } from '../db/visits';
import type { AppEnv } from '../env';

const SHARE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const sharesAuthedRouter = new Hono<AppEnv>();
export const sharesPublicRouter = new Hono<AppEnv>();

sharesAuthedRouter.post('/', async (c) => {
    const user = c.get('user');
    const existing = await getShareIdByUser(c.env.DB, user.sub);
    if (existing) {
        const response: CreateShareResponse = { shareId: existing };
        return c.json(response);
    }

    const shareId = crypto.randomUUID();
    await insertShare(c.env.DB, shareId, user.sub, nowSeconds());
    const response: CreateShareResponse = { shareId };
    return c.json(response, 201);
});

sharesPublicRouter.get('/:shareId', async (c) => {
    const shareId = c.req.param('shareId');
    if (!SHARE_ID_PATTERN.test(shareId)) {
        return c.json({ error: 'Invalid share id' }, 400);
    }

    const userId = await getUserIdByShareId(c.env.DB, shareId);
    if (!userId) {
        return c.json({ error: 'Share not found' }, 404);
    }

    const visits = await listVisits(c.env.DB, userId);
    const response: GetShareResponse = { visits };
    return c.json(response);
});

function nowSeconds(): number {
    return Math.floor(Date.now() / 1000);
}
