import type { D1Database } from '@cloudflare/workers-types';
import type { VisitRecord } from '@shared/api-types';

interface VisitRow {
    station_id: string;
    style_id: number;
    updated_at: number;
}

export async function listVisits(db: D1Database, userId: string): Promise<VisitRecord[]> {
    const result = await db
        .prepare('SELECT station_id, style_id, updated_at FROM visits WHERE user_id = ?')
        .bind(userId)
        .all<VisitRow>();

    return (result.results ?? []).map((row) => ({
        stationId: row.station_id,
        styleId: row.style_id,
        updatedAt: row.updated_at,
    }));
}

export async function upsertVisit(
    db: D1Database,
    userId: string,
    stationId: string,
    styleId: number,
    updatedAt: number
): Promise<void> {
    await db
        .prepare(
            `INSERT INTO visits (user_id, station_id, style_id, updated_at)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(user_id, station_id) DO UPDATE SET
                 style_id = excluded.style_id,
                 updated_at = excluded.updated_at`
        )
        .bind(userId, stationId, styleId, updatedAt)
        .run();
}

export async function deleteVisit(db: D1Database, userId: string, stationId: string): Promise<void> {
    await db
        .prepare('DELETE FROM visits WHERE user_id = ? AND station_id = ?')
        .bind(userId, stationId)
        .run();
}
