import type { D1Database } from '@cloudflare/workers-types';

export async function getShareIdByUser(db: D1Database, userId: string): Promise<string | null> {
    const row = await db
        .prepare('SELECT share_id FROM shares WHERE user_id = ?')
        .bind(userId)
        .first<{ share_id: string }>();
    return row?.share_id ?? null;
}

export async function getUserIdByShareId(db: D1Database, shareId: string): Promise<string | null> {
    const row = await db
        .prepare('SELECT user_id FROM shares WHERE share_id = ?')
        .bind(shareId)
        .first<{ user_id: string }>();
    return row?.user_id ?? null;
}

export async function insertShare(
    db: D1Database,
    shareId: string,
    userId: string,
    createdAt: number
): Promise<void> {
    await db
        .prepare('INSERT INTO shares (share_id, user_id, created_at) VALUES (?, ?, ?)')
        .bind(shareId, userId, createdAt)
        .run();
}
