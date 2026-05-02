import { Hono } from 'hono';
import type { AppEnv } from './env';
import { visitsRouter } from './handlers/visits';
import { requireAuth } from './middleware/auth';
import { corsMiddleware } from './middleware/cors';

const app = new Hono<AppEnv>();

app.use('*', corsMiddleware());

app.get('/health', (c) => c.json({ status: 'ok' }));

app.use('/api/*', requireAuth());
app.route('/api/visits', visitsRouter);

app.onError((error, c) => {
    console.error(error);
    return c.json({ error: 'Internal server error' }, 500);
});

export default app;
