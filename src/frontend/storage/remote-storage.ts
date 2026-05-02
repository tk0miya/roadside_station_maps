import type { Storage } from './types';
import { VisitsApiClient, VisitsApiError } from './visits-api-client';

const DEFAULT_DEBOUNCE_MS = 400;

type PendingOp = { kind: 'put'; styleId: number } | { kind: 'delete' };

export interface RemoteStorageOptions {
    client: VisitsApiClient;
    debounceMs?: number;
    onSyncError?: (error: VisitsApiError | Error, stationId: string) => void;
    setTimeoutImpl?: typeof setTimeout;
    clearTimeoutImpl?: typeof clearTimeout;
}

/**
 * Storage implementation backed by the Workers + D1 visits API.
 *
 * Loads the full set of visits up-front into an in-memory cache so the synchronous
 * Storage interface (getItem / setItem / listItems) keeps working. Writes update the
 * cache immediately and are flushed to the API per-station with a short debounce so
 * rapid clicks on the same station collapse into a single request.
 */
export class RemoteStorage implements Storage {
    private readonly cache = new Map<string, string>();
    private readonly pending = new Map<string, PendingOp>();
    private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
    private readonly client: VisitsApiClient;
    private readonly debounceMs: number;
    private readonly onSyncError: (error: VisitsApiError | Error, stationId: string) => void;
    private readonly setTimeoutImpl: typeof setTimeout;
    private readonly clearTimeoutImpl: typeof clearTimeout;

    private constructor(options: RemoteStorageOptions) {
        this.client = options.client;
        this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
        this.onSyncError = options.onSyncError ?? (() => {});
        this.setTimeoutImpl = options.setTimeoutImpl ?? setTimeout;
        this.clearTimeoutImpl = options.clearTimeoutImpl ?? clearTimeout;
    }

    static async create(options: RemoteStorageOptions): Promise<RemoteStorage> {
        const storage = new RemoteStorage(options);
        await storage.load();
        return storage;
    }

    getItem(key: string): string | null {
        return this.cache.get(key) ?? null;
    }

    setItem(key: string, value: string): void {
        this.cache.set(key, value);
        const styleId = Number.parseInt(value, 10);
        if (!Number.isFinite(styleId)) {
            return;
        }
        this.schedule(key, { kind: 'put', styleId });
    }

    removeItem(key: string): void {
        if (!this.cache.has(key)) {
            this.pending.delete(key);
            this.clearTimer(key);
            return;
        }
        this.cache.delete(key);
        this.schedule(key, { kind: 'delete' });
    }

    listItems(): string[] {
        return Array.from(this.cache.keys());
    }

    /**
     * Replace local cache contents from a bulk import. Used for migrating from
     * LocalStorage on first sign-in. Does not trigger network writes; the caller
     * is expected to push to the server explicitly.
     */
    replaceCache(entries: Array<{ stationId: string; styleId: number }>): void {
        this.cache.clear();
        for (const entry of entries) {
            this.cache.set(entry.stationId, String(entry.styleId));
        }
    }

    /**
     * Merge new entries into the cache without triggering writes. Used after a
     * successful bulk migration so the UI reflects the migrated entries
     * immediately without an extra round-trip to the server.
     */
    mergeCache(entries: Array<{ stationId: string; styleId: number }>): void {
        for (const entry of entries) {
            this.cache.set(entry.stationId, String(entry.styleId));
        }
    }

    /** Flush all pending writes immediately. Intended for tests and shutdown. */
    async flush(): Promise<void> {
        const stationIds = Array.from(this.timers.keys());
        for (const stationId of stationIds) {
            this.clearTimer(stationId);
        }
        await Promise.all(stationIds.map((stationId) => this.flushOne(stationId)));
    }

    private async load(): Promise<void> {
        const visits = await this.client.list();
        this.cache.clear();
        for (const visit of visits) {
            this.cache.set(visit.stationId, String(visit.styleId));
        }
    }

    private schedule(stationId: string, op: PendingOp): void {
        this.pending.set(stationId, op);
        this.clearTimer(stationId);
        const timer = this.setTimeoutImpl(() => {
            this.timers.delete(stationId);
            void this.flushOne(stationId);
        }, this.debounceMs);
        this.timers.set(stationId, timer);
    }

    private clearTimer(stationId: string): void {
        const timer = this.timers.get(stationId);
        if (timer !== undefined) {
            this.clearTimeoutImpl(timer);
            this.timers.delete(stationId);
        }
    }

    private async flushOne(stationId: string): Promise<void> {
        const op = this.pending.get(stationId);
        if (!op) return;
        this.pending.delete(stationId);
        try {
            if (op.kind === 'put') {
                await this.client.put(stationId, op.styleId);
            } else {
                await this.client.delete(stationId);
            }
        } catch (error) {
            const normalized =
                error instanceof Error ? error : new Error(`Sync failed for station ${stationId}`);
            this.onSyncError(normalized, stationId);
        }
    }
}
