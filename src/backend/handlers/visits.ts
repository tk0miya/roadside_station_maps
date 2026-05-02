import { Hono, type Context } from 'hono';
import type { ListVisitsResponse, PutVisitRequest } from '@shared/api-types';
import { deleteVisit, listVisits, upsertVisit } from '../db/visits';
import type { AppEnv } from '../env';

const MIN_STYLE_ID = 1;
const MAX_STYLE_ID = 4;
const STATION_ID_PATTERN = /^\d+$/;

export const visitsRouter = new Hono<AppEnv>();

visitsRouter.get('/', async (c) => {
    const user = c.get('user');
    const visits = await listVisits(c.env.DB, user.sub);
    const response: ListVisitsResponse = { visits };
    return c.json(response);
});

visitsRouter.put('/:stationId', async (c) => {
    const user = c.get('user');
    const stationId = c.req.param('stationId');
    if (!isValidStationId(stationId)) {
        return c.json({ error: 'Invalid station id' }, 400);
    }

    const body = await readJson<PutVisitRequest>(c);
    if (!body || !isValidStyleId(body.styleId)) {
        return c.json({ error: 'Invalid style id' }, 400);
    }

    await upsertVisit(c.env.DB, user.sub, stationId, body.styleId, nowSeconds());
    return c.body(null, 204);
});

visitsRouter.delete('/:stationId', async (c) => {
    const user = c.get('user');
    const stationId = c.req.param('stationId');
    if (!isValidStationId(stationId)) {
        return c.json({ error: 'Invalid station id' }, 400);
    }

    await deleteVisit(c.env.DB, user.sub, stationId);
    return c.body(null, 204);
});

function isValidStationId(value: unknown): value is string {
    return typeof value === 'string' && STATION_ID_PATTERN.test(value);
}

function isValidStyleId(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= MIN_STYLE_ID && value <= MAX_STYLE_ID;
}

async function readJson<T>(c: Context<AppEnv>): Promise<T | null> {
    try {
        return (await c.req.json()) as T;
    } catch {
        return null;
    }
}

function nowSeconds(): number {
    return Math.floor(Date.now() / 1000);
}
