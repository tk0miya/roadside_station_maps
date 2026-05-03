import type { MiddlewareHandler } from 'hono';
import { verifySessionToken } from '../auth/session';
import type { AppEnv } from '../env';

export const requireAuth = (): MiddlewareHandler<AppEnv> => {
    return async (c, next) => {
        const header = c.req.header('Authorization');
        if (!header || !header.startsWith('Bearer ')) {
            return c.json({ error: 'Missing bearer token' }, 401);
        }

        if (!c.env.SESSION_SECRET || c.env.SESSION_SECRET.length === 0) {
            return c.json({ error: 'SESSION_SECRET is not configured' }, 500);
        }

        const token = header.slice('Bearer '.length).trim();
        let sub: string;
        try {
            ({ sub } = await verifySessionToken(token, c.env.SESSION_SECRET));
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Invalid token';
            return c.json({ error: message }, 401);
        }

        c.set('user', { sub });
        await next();
        return;
    };
};
