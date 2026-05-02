import type { MiddlewareHandler } from 'hono';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { AppEnv } from '../env';

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

export const requireAuth = (): MiddlewareHandler<AppEnv> => {
    return async (c, next) => {
        const header = c.req.header('Authorization');
        if (!header || !header.startsWith('Bearer ')) {
            return c.json({ error: 'Missing bearer token' }, 401);
        }

        const token = header.slice('Bearer '.length).trim();
        try {
            const { payload } = await jwtVerify(token, GOOGLE_JWKS, {
                issuer: GOOGLE_ISSUERS,
                audience: c.env.GOOGLE_CLIENT_ID,
                algorithms: ['RS256'],
            });
            if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
                return c.json({ error: 'ID token is missing the sub claim' }, 401);
            }
            c.set('user', { sub: payload.sub });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Invalid token';
            return c.json({ error: message }, 401);
        }

        await next();
        return;
    };
};
