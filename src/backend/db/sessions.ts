import type { D1Database } from '@cloudflare/workers-types';

export interface SessionRow {
    sid: string;
    userId: string;
    createdAt: number;
    lastUsedAt: number;
    revokedAt: number | null;
}

interface RawSessionRow {
    sid: string;
    user_id: string;
    created_at: number;
    last_used_at: number;
    revoked_at: number | null;
}

export async function createSession(
    db: D1Database,
    sid: string,
    userId: string,
    now: number
): Promise<void> {
    await db
        .prepare(
            `INSERT INTO sessions (sid, user_id, created_at, last_used_at, revoked_at)
             VALUES (?, ?, ?, ?, NULL)`
        )
        .bind(sid, userId, now, now)
        .run();
}

export async function getActiveSession(
    db: D1Database,
    sid: string
): Promise<SessionRow | null> {
    const row = await db
        .prepare(
            'SELECT sid, user_id, created_at, last_used_at, revoked_at FROM sessions WHERE sid = ?'
        )
        .bind(sid)
        .first<RawSessionRow>();
    if (!row) return null;
    return {
        sid: row.sid,
        userId: row.user_id,
        createdAt: row.created_at,
        lastUsedAt: row.last_used_at,
        revokedAt: row.revoked_at,
    };
}

export async function touchSession(db: D1Database, sid: string, now: number): Promise<void> {
    await db
        .prepare('UPDATE sessions SET last_used_at = ? WHERE sid = ?')
        .bind(now, sid)
        .run();
}

export async function revokeSession(db: D1Database, sid: string, now: number): Promise<void> {
    await db
        .prepare('UPDATE sessions SET revoked_at = ? WHERE sid = ? AND revoked_at IS NULL')
        .bind(now, sid)
        .run();
}
