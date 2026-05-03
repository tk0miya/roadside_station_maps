import type { MiddlewareHandler } from 'hono';
import { verifyAccessToken } from '../auth/tokens';
import type { AppEnv } from '../env';

export const requireAuth = (): MiddlewareHandler<AppEnv> => {
    return async (c, next) => {
        const header = c.req.header('Authorization');
        if (!header || !header.startsWith('Bearer ')) {
            return c.json({ error: 'Missing bearer token' }, 401);
        }

        const token = header.slice('Bearer '.length).trim();
        try {
            const claims = await verifyAccessToken(c.env.SESSION_JWT_SECRET, token);
            c.set('user', { sub: claims.sub });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Invalid token';
            return c.json({ error: message }, 401);
        }

        await next();
        return;
    };
};
