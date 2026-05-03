import { cors } from 'hono/cors';
import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../env';

export const corsMiddleware = (): MiddlewareHandler<AppEnv> => {
    return async (c, next) => {
        const allowed = c.env.ALLOWED_ORIGINS.split(',')
            .map((value) => value.trim())
            .filter((value) => value.length > 0);

        const handler = cors({
            origin: (origin) => (allowed.includes(origin) ? origin : null),
            allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowHeaders: ['Authorization', 'Content-Type'],
            maxAge: 86400,
        });
        return handler(c, next);
    };
};
