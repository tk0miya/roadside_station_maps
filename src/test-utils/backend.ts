import { Hono } from 'hono';
import type { AppEnv } from '../backend/env';

export const TEST_ENV = {
    DB: {} as unknown as AppEnv['Bindings']['DB'],
    GOOGLE_CLIENT_ID: 'test-client',
    SESSION_SECRET: 'test-session-secret-not-used-in-production',
    ALLOWED_ORIGINS: 'http://localhost:8081',
};

// Build a Hono app for tests, optionally injecting an authenticated user
export function buildTestApp(
    mount: (app: Hono<AppEnv>) => void,
    user: { sub: string } | null = { sub: 'user-1' }
): Hono<AppEnv> {
    const app = new Hono<AppEnv>();
    if (user) {
        app.use('*', async (c, next) => {
            c.set('user', user);
            await next();
        });
    }
    mount(app);
    return app;
}
