import { Hono, type Context } from 'hono';
import type { BulkPutVisitsRequest, ListVisitsResponse, PutVisitRequest } from '@shared/api-types';
import { bulkUpsertVisits, deleteVisit, listVisits, upsertVisit } from '../db/visits';
import type { AppEnv } from '../env';

const MIN_STYLE_ID = 1;
const MAX_STYLE_ID = 4;
const STATION_ID_PATTERN = /^\d+$/;
const MAX_BULK_SIZE = 2000;

export const visitsRouter = new Hono<AppEnv>();

visitsRouter.get('/', async (c) => {
    const user = c.get('user');
    const visits = await listVisits(c.env.DB, user.sub);
    const response: ListVisitsResponse = { visits };
    return c.json(response);
});

visitsRouter.put('/', async (c) => {
    const user = c.get('user');
    const body = await readJson<BulkPutVisitsRequest>(c);
    if (!body || !Array.isArray(body.visits)) {
        return c.json({ error: 'Invalid request body' }, 400);
    }
    if (body.visits.length > MAX_BULK_SIZE) {
        return c.json({ error: `Too many visits (max ${MAX_BULK_SIZE})` }, 400);
    }
    for (const entry of body.visits) {
        if (!isValidStationId(entry.stationId) || !isValidStyleId(entry.styleId)) {
            return c.json({ error: 'Invalid visit entry' }, 400);
        }
    }

    await bulkUpsertVisits(c.env.DB, user.sub, body.visits, nowSeconds());
    return c.body(null, 204);
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
