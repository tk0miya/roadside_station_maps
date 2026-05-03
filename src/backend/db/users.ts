import type { D1Database } from '@cloudflare/workers-types';

export async function upsertUser(
    db: D1Database,
    userId: string,
    googleRefreshToken: string,
    now: number
): Promise<void> {
    await db
        .prepare(
            `INSERT INTO users (user_id, google_refresh_token, google_refresh_updated_at, created_at)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(user_id) DO UPDATE SET
                 google_refresh_token = excluded.google_refresh_token,
                 google_refresh_updated_at = excluded.google_refresh_updated_at`
        )
        .bind(userId, googleRefreshToken, now, now)
        .run();
}

export async function getUserGoogleRefreshToken(
    db: D1Database,
    userId: string
): Promise<string | null> {
    const row = await db
        .prepare('SELECT google_refresh_token FROM users WHERE user_id = ?')
        .bind(userId)
        .first<{ google_refresh_token: string }>();
    return row?.google_refresh_token ?? null;
}
