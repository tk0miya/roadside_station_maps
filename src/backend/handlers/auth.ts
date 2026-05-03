import { Hono, type Context } from 'hono';
import type {
    AuthLoginRequest,
    AuthLoginResponse,
    AuthRefreshRequest,
    AuthRefreshResponse,
} from '@shared/auth-types';
import { createSession, deleteSession, getSession, touchSession } from '../db/sessions';
import { getUserGoogleRefreshToken, upsertUser } from '../db/users';
import type { AppEnv } from '../env';
import { GoogleAuthError, exchangeAuthorizationCode, isGoogleRefreshTokenValid } from '../auth/google';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../auth/tokens';

// A session is considered valid as long as it is used at least once every
// IDLE_REFRESH_LIMIT_SECONDS. Aligned with our "365 day idle revocation" rule.
const IDLE_REFRESH_LIMIT_SECONDS = 365 * 24 * 60 * 60;

export const authRouter = new Hono<AppEnv>();

authRouter.post('/login', async (c) => {
    const body = await readJson<AuthLoginRequest>(c);
    if (!body || typeof body.code !== 'string' || body.code.length === 0) {
        return c.json({ error: 'Missing authorization code' }, 400);
    }

    let exchange: Awaited<ReturnType<typeof exchangeAuthorizationCode>>;
    try {
        exchange = await exchangeAuthorizationCode(
            c.env.GOOGLE_CLIENT_ID,
            c.env.GOOGLE_CLIENT_SECRET,
            body.code
        );
    } catch (error) {
        return c.json({ error: errorMessage(error) }, 401);
    }

    const now = nowSeconds();
    await upsertUser(c.env.DB, exchange.googleSub, exchange.refreshToken, now);

    const sid = crypto.randomUUID();
    await createSession(c.env.DB, sid, exchange.googleSub, now);

    const accessToken = await signAccessToken(
        c.env.SESSION_JWT_SECRET,
        { sub: exchange.googleSub, sid },
        now
    );
    const refreshToken = await signRefreshToken(
        c.env.SESSION_JWT_SECRET,
        { sub: exchange.googleSub, sid },
        now
    );

    const response: AuthLoginResponse = {
        accessToken,
        refreshToken,
        user: { sub: exchange.googleSub },
    };
    return c.json(response);
});

authRouter.post('/refresh', async (c) => {
    const body = await readJson<AuthRefreshRequest>(c);
    if (!body || typeof body.refreshToken !== 'string' || body.refreshToken.length === 0) {
        return c.json({ error: 'Missing refresh token' }, 400);
    }

    let claims: Awaited<ReturnType<typeof verifyRefreshToken>>;
    try {
        claims = await verifyRefreshToken(c.env.SESSION_JWT_SECRET, body.refreshToken);
    } catch {
        return c.json({ error: 'Invalid refresh token' }, 401);
    }

    const session = await getSession(c.env.DB, claims.sid);
    if (!session || session.userId !== claims.sub) {
        return c.json({ error: 'Session is no longer valid' }, 401);
    }

    const now = nowSeconds();
    if (now - session.lastUsedAt > IDLE_REFRESH_LIMIT_SECONDS) {
        await deleteSession(c.env.DB, claims.sid);
        return c.json({ error: 'Session expired due to inactivity' }, 401);
    }

    // Confirm the user has not revoked our access on the Google side.
    const googleRefreshToken = await getUserGoogleRefreshToken(c.env.DB, claims.sub);
    if (!googleRefreshToken) {
        await deleteSession(c.env.DB, claims.sid);
        return c.json({ error: 'No Google refresh token on file' }, 401);
    }
    let googleStillValid: boolean;
    try {
        googleStillValid = await isGoogleRefreshTokenValid(
            c.env.GOOGLE_CLIENT_ID,
            c.env.GOOGLE_CLIENT_SECRET,
            googleRefreshToken
        );
    } catch (error) {
        // Network or transient Google error: do not delete the session, surface
        // 5xx so the client retries later.
        return c.json({ error: errorMessage(error) }, 502);
    }
    if (!googleStillValid) {
        await deleteSession(c.env.DB, claims.sid);
        return c.json({ error: 'Google access has been revoked' }, 401);
    }

    await touchSession(c.env.DB, claims.sid, now);

    const accessToken = await signAccessToken(
        c.env.SESSION_JWT_SECRET,
        { sub: claims.sub, sid: claims.sid },
        now
    );

    const response: AuthRefreshResponse = { accessToken };
    return c.json(response);
});

async function readJson<T>(c: Context<AppEnv>): Promise<T | null> {
    try {
        return (await c.req.json()) as T;
    } catch {
        return null;
    }
}

function nowSeconds(): number {
    return Math.floor(Date.now() / 1000);
}

function errorMessage(error: unknown): string {
    if (error instanceof GoogleAuthError) return error.message;
    if (error instanceof Error) return error.message;
    return 'Unknown error';
}
