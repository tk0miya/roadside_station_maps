import type { MiddlewareHandler } from 'hono';
import { issueSessionToken, verifySessionToken } from '../auth/session';
import type { AppEnv } from '../env';

// Re-issue the session token when the remaining lifetime drops below this many
// seconds. As long as the user makes at least one authenticated request inside
// this window, the session keeps getting extended.
const ROTATION_THRESHOLD_SECONDS = 60 * 60 * 24 * 30;

export const SESSION_TOKEN_HEADER = 'X-Session-Token';
export const SESSION_EXPIRES_AT_HEADER = 'X-Session-Expires-At';

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
        let exp: number;
        try {
            const payload = await verifySessionToken(token, c.env.SESSION_SECRET);
            sub = payload.sub;
            exp = payload.exp;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Invalid token';
            return c.json({ error: message }, 401);
        }

        c.set('user', { sub });
        await next();

        const remaining = exp - Math.floor(Date.now() / 1000);
        if (remaining < ROTATION_THRESHOLD_SECONDS) {
            const refreshed = await issueSessionToken(sub, c.env.SESSION_SECRET);
            c.res.headers.set(SESSION_TOKEN_HEADER, refreshed.token);
            c.res.headers.set(SESSION_EXPIRES_AT_HEADER, String(refreshed.expiresAt));
        }
        return;
    };
};
