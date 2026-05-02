import type { RemoteStorage } from './remote-storage';
import type { Storage } from './types';
import type { VisitsApiClient } from './visits-api-client';

export const MIGRATION_FLAG_KEY = 'migration:cloudSync:done';

const MIN_STYLE_ID = 1;
const MAX_STYLE_ID = 4;

export interface FlagStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

export interface MigrateOptions {
    local: Storage;
    remote: RemoteStorage;
    client: VisitsApiClient;
    flagStorage?: FlagStorage;
}

export interface MigrateResult {
    migrated: number;
    skipped: boolean;
}

/**
 * One-shot migration that uploads entries from the legacy LocalStorage backend
 * to the cloud on first sign-in. Server-side entries always take precedence:
 * a station that already has a remote entry is left untouched, so signing in
 * from a second device does not overwrite the canonical record.
 */
export async function migrateLocalToRemote(options: MigrateOptions): Promise<MigrateResult> {
    const flagStorage = options.flagStorage ?? defaultFlagStorage();
    if (flagStorage.getItem(MIGRATION_FLAG_KEY) === '1') {
        return { migrated: 0, skipped: true };
    }

    const remoteIds = new Set(options.remote.listItems());
    const toMigrate: Array<{ stationId: string; styleId: number }> = [];
    for (const stationId of options.local.listItems()) {
        if (remoteIds.has(stationId)) continue;
        const raw = options.local.getItem(stationId);
        if (!raw) continue;
        const styleId = Number.parseInt(raw, 10);
        if (!Number.isFinite(styleId) || styleId < MIN_STYLE_ID || styleId > MAX_STYLE_ID) continue;
        toMigrate.push({ stationId, styleId });
    }

    if (toMigrate.length > 0) {
        await options.client.bulkPut(toMigrate);
        options.remote.mergeCache(toMigrate);
    }

    flagStorage.setItem(MIGRATION_FLAG_KEY, '1');
    return { migrated: toMigrate.length, skipped: false };
}

function defaultFlagStorage(): FlagStorage {
    return {
        getItem: (key) => localStorage.getItem(key),
        setItem: (key, value) => localStorage.setItem(key, value),
    };
}
