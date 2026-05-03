import { Hono, type Context } from 'hono';
import type { CreateSessionRequest, CreateSessionResponse } from '@shared/api-types';
import { GoogleAuthError, verifyIdToken } from '../auth/google';
import { issueSessionToken } from '../auth/session';
import type { AppEnv } from '../env';

export const sessionsRouter = new Hono<AppEnv>();

sessionsRouter.post('/', async (c) => {
    if (!c.env.SESSION_SECRET || c.env.SESSION_SECRET.length === 0) {
        return c.json({ error: 'SESSION_SECRET is not configured' }, 500);
    }

    const body = await readJson<CreateSessionRequest>(c);
    if (!body || body.provider !== 'google') {
        return c.json({ error: 'Unsupported or missing provider' }, 400);
    }
    if (typeof body.idToken !== 'string' || body.idToken.length === 0) {
        return c.json({ error: 'Missing Google id_token' }, 400);
    }

    let sub: string;
    try {
        const result = await verifyIdToken(body.idToken, c.env.GOOGLE_CLIENT_ID);
        sub = result.sub;
    } catch (error) {
        if (error instanceof GoogleAuthError) {
            return c.json({ error: error.message }, error.status);
        }
        const message = error instanceof Error ? error.message : 'Failed to verify Google identity';
        return c.json({ error: message }, 401);
    }

    const session = await issueSessionToken(sub, c.env.SESSION_SECRET);
    const response: CreateSessionResponse = {
        sessionToken: session.token,
        expiresAt: session.expiresAt,
    };
    return c.json(response, 201);
});

async function readJson<T>(c: Context<AppEnv>): Promise<T | null> {
    try {
        return (await c.req.json()) as T;
    } catch {
        return null;
    }
}
