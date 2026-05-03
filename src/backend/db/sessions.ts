import type { D1Database } from '@cloudflare/workers-types';

export interface SessionRow {
    sid: string;
    userId: string;
    createdAt: number;
    lastUsedAt: number;
}

interface RawSessionRow {
    sid: string;
    user_id: string;
    created_at: number;
    last_used_at: number;
}

export async function createSession(
    db: D1Database,
    sid: string,
    userId: string,
    now: number
): Promise<void> {
    await db
        .prepare(
            `INSERT INTO sessions (sid, user_id, created_at, last_used_at)
             VALUES (?, ?, ?, ?)`
        )
        .bind(sid, userId, now, now)
        .run();
}

export async function getSession(db: D1Database, sid: string): Promise<SessionRow | null> {
    const row = await db
        .prepare('SELECT sid, user_id, created_at, last_used_at FROM sessions WHERE sid = ?')
        .bind(sid)
        .first<RawSessionRow>();
    if (!row) return null;
    return {
        sid: row.sid,
        userId: row.user_id,
        createdAt: row.created_at,
        lastUsedAt: row.last_used_at,
    };
}

export async function touchSession(db: D1Database, sid: string, now: number): Promise<void> {
    await db.prepare('UPDATE sessions SET last_used_at = ? WHERE sid = ?').bind(now, sid).run();
}

export async function deleteSession(db: D1Database, sid: string): Promise<void> {
    await db.prepare('DELETE FROM sessions WHERE sid = ?').bind(sid).run();
}
