import queryString from 'query-string';
import { MemoryStorage } from './memory-storage';
import { RemoteStorage } from './remote-storage';
import { SharesApiClient } from './shares-api-client';
import { Storage } from './types';
import { VisitsApiClient } from './visits-api-client';

export interface CreateStorageOptions {
    getSessionToken: () => string | null;
    onSessionRefreshed?: (token: string) => void;
    onUnauthorized?: () => void;
}

/**
 * Async Storage factory aware of the user's auth state.
 *
 * - `?share=<id>` -> MemoryStorage hydrated from the shares API
 * - signed-in user -> RemoteStorage backed by the Workers + D1 API
 * - otherwise      -> MemoryStorage (guest mode, data lives only in memory)
 */
export async function createStorage(options: CreateStorageOptions): Promise<Storage> {
    const queries = queryString.parse(location.search);

    if (typeof queries.share === 'string' && queries.share.length > 0) {
        const sharesClient = new SharesApiClient({
            getSessionToken: options.getSessionToken,
            onSessionRefreshed: options.onSessionRefreshed,
            onUnauthorized: options.onUnauthorized,
        });
        const visits = await sharesClient.get(queries.share);
        const entries: Array<[string, string]> = visits.map((visit) => [
            visit.stationId,
            String(visit.styleId),
        ]);
        return new MemoryStorage(entries);
    }

    if (options.getSessionToken()) {
        const client = new VisitsApiClient({
            getSessionToken: options.getSessionToken,
            onSessionRefreshed: options.onSessionRefreshed,
            onUnauthorized: options.onUnauthorized,
        });
        return RemoteStorage.create({ client });
    }

    return new MemoryStorage();
}
