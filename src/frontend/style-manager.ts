import queryString from 'query-string';
import { MemoryStorage } from './storage/memory-storage';
import { RemoteStorage } from './storage/remote-storage';
import { SharesApiClient } from './storage/shares-api-client';
import { Storage } from './storage/types';
import { VisitsApiClient, type VisitsApiError } from './storage/visits-api-client';
import { RoadStation } from './road-station';
import type { AuthState } from '@shared/auth-types';

export const STYLE_COUNT = 5;
const MAX_STYLE_ID = STYLE_COUNT - 1;

export class StyleManager {
    constructor(public storage: Storage) { }

    private getStationId(station: RoadStation | string): string {
        return typeof station === 'string' ? station : station.stationId;
    }

    getStyle(station: RoadStation | string): number {
        const stationId = this.getStationId(station);
        const styleId = this.storage.getItem(stationId);
        if (styleId) {
            return parseInt(styleId);
        }
        return 0;
    }

    changeStyle(station: RoadStation | string): number {
        const stationId = this.getStationId(station);
        const current = this.getStyle(stationId);
        if (current >= MAX_STYLE_ID) {
            return this.resetStyle(stationId);
        }
        const next = current + 1;
        this.storage.setItem(stationId, next.toString());
        return next;
    }

    resetStyle(station: RoadStation | string): number {
        const stationId = this.getStationId(station);
        this.storage.removeItem(stationId);
        return 0;
    }

    countByStyle(totalStations: number): Record<number, number> {
        const counts: Record<number, number> = {};
        for (let i = 0; i < STYLE_COUNT; i++) {
            counts[i] = 0;
        }

        const stationIds = this.storage.listItems();
        stationIds.forEach(stationId => {
            const styleId = this.getStyle(stationId);
            counts[styleId]++;
        });

        // StyleId 0 = total stations - assigned stations
        const assignedCount = Object.values(counts).reduce((sum, count) => sum + count, 0) - counts[0];
        counts[0] = totalStations - assignedCount;

        return counts;
    }
}

export interface CreateStyleManagerOptions {
    authState: AuthState;
    getIdToken: () => string | null;
    onSyncError?: (error: VisitsApiError | Error, stationId: string) => void;
}

/**
 * Async StyleManager factory aware of the user's auth state.
 *
 * - `?share=<id>` -> MemoryStorage hydrated from the shares API
 * - signed-in user -> RemoteStorage backed by the Workers + D1 API
 * - otherwise      -> MemoryStorage (guest mode, data lives only in memory)
 */
export async function createStyleManager(options: CreateStyleManagerOptions): Promise<StyleManager> {
    const queries = queryString.parse(location.search);

    if (typeof queries.share === 'string' && queries.share.length > 0) {
        const sharesClient = new SharesApiClient({ getIdToken: options.getIdToken });
        const visits = await sharesClient.get(queries.share);
        const entries: Array<[string, string]> = visits.map((visit) => [
            visit.stationId,
            String(visit.styleId),
        ]);
        return new StyleManager(new MemoryStorage(entries));
    }

    if (options.authState.idToken) {
        const client = new VisitsApiClient({ getIdToken: options.getIdToken });
        const storage = await RemoteStorage.create({
            client,
            onSyncError: options.onSyncError,
        });

        return new StyleManager(storage);
    }

    return new StyleManager(new MemoryStorage());
}
