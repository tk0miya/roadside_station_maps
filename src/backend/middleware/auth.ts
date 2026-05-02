import type { MiddlewareHandler } from 'hono';
import { verifyIdToken } from '../auth/jwt';
import type { AppEnv } from '../env';

export const requireAuth = (): MiddlewareHandler<AppEnv> => {
    return async (c, next) => {
        const header = c.req.header('Authorization');
        if (!header || !header.startsWith('Bearer ')) {
            return c.json({ error: 'Missing bearer token' }, 401);
        }

        const token = header.slice('Bearer '.length).trim();
        try {
            const user = await verifyIdToken(token, { clientId: c.env.GOOGLE_CLIENT_ID });
            c.set('user', user);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Invalid token';
            return c.json({ error: message }, 401);
        }

        await next();
        return;
    };
};
