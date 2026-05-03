import { Hono } from 'hono';
import type { AppEnv } from './env';
import { sessionsRouter } from './handlers/sessions';
import { sharesAuthedRouter, sharesPublicRouter } from './handlers/shares';
import { visitsRouter } from './handlers/visits';
import { requireAuth } from './middleware/auth';
import { corsMiddleware } from './middleware/cors';

const app = new Hono<AppEnv>();

app.use('*', corsMiddleware());

app.get('/health', (c) => c.json({ status: 'ok' }));

app.route('/sessions', sessionsRouter);
app.route('/shares', sharesPublicRouter);

app.use('/api/*', requireAuth());
app.route('/api/visits', visitsRouter);
app.route('/api/shares', sharesAuthedRouter);

app.onError((error, c) => {
    console.error(error);
    return c.json({ error: 'Internal server error' }, 500);
});

export default app;
