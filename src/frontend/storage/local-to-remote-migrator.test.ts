import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    type FlagStorage,
    MIGRATION_FLAG_KEY,
    migrateLocalToRemote,
} from './local-to-remote-migrator';
import { RemoteStorage } from './remote-storage';
import type { Storage } from './types';
import type { VisitsApiClient } from './visits-api-client';

class InMemoryStorage implements Storage {
    private readonly map = new Map<string, string>();

    constructor(initial: Record<string, string> = {}) {
        for (const [key, value] of Object.entries(initial)) {
            this.map.set(key, value);
        }
    }

    getItem(key: string): string | null {
        return this.map.get(key) ?? null;
    }

    setItem(key: string, value: string): void {
        this.map.set(key, value);
    }

    removeItem(key: string): void {
        this.map.delete(key);
    }

    listItems(): string[] {
        return Array.from(this.map.keys());
    }
}

class InMemoryFlagStorage implements FlagStorage {
    private readonly map = new Map<string, string>();

    constructor(initial: Record<string, string> = {}) {
        for (const [key, value] of Object.entries(initial)) {
            this.map.set(key, value);
        }
    }

    getItem(key: string): string | null {
        return this.map.get(key) ?? null;
    }

    setItem(key: string, value: string): void {
        this.map.set(key, value);
    }
}

function createClient() {
    return {
        list: vi.fn().mockResolvedValue([]),
        put: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
        bulkPut: vi.fn().mockResolvedValue(undefined),
    } satisfies Record<keyof VisitsApiClient, ReturnType<typeof vi.fn>>;
}

async function buildRemoteStorage(initial: Array<{ stationId: string; styleId: number }> = []) {
    const client = createClient();
    client.list.mockResolvedValueOnce(
        initial.map((entry) => ({ ...entry, updatedAt: 0 }))
    );
    const storage = await RemoteStorage.create({ client: client as unknown as VisitsApiClient });
    return { storage, client };
}

describe('migrateLocalToRemote', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('uploads local entries that are not present on the server', async () => {
        const local = new InMemoryStorage({ '111': '1', '222': '3' });
        const { storage, client } = await buildRemoteStorage();
        const flagStorage = new InMemoryFlagStorage();

        const result = await migrateLocalToRemote({
            local,
            remote: storage,
            client: client as unknown as VisitsApiClient,
            flagStorage,
        });

        expect(result).toEqual({ migrated: 2, skipped: false });
        expect(client.bulkPut).toHaveBeenCalledTimes(1);
        expect(client.bulkPut.mock.calls[0][0]).toEqual([
            { stationId: '111', styleId: 1 },
            { stationId: '222', styleId: 3 },
        ]);
        expect(storage.getItem('111')).toBe('1');
        expect(storage.getItem('222')).toBe('3');
        expect(flagStorage.getItem(MIGRATION_FLAG_KEY)).toBe('1');
    });

    it('skips entries that already exist on the server', async () => {
        const local = new InMemoryStorage({ '111': '1', '222': '3' });
        const { storage, client } = await buildRemoteStorage([
            { stationId: '111', styleId: 4 },
        ]);
        const flagStorage = new InMemoryFlagStorage();

        const result = await migrateLocalToRemote({
            local,
            remote: storage,
            client: client as unknown as VisitsApiClient,
            flagStorage,
        });

        expect(result).toEqual({ migrated: 1, skipped: false });
        expect(client.bulkPut.mock.calls[0][0]).toEqual([{ stationId: '222', styleId: 3 }]);
        expect(storage.getItem('111')).toBe('4');
        expect(flagStorage.getItem(MIGRATION_FLAG_KEY)).toBe('1');
    });

    it('does nothing and skips when the migration flag is already set', async () => {
        const local = new InMemoryStorage({ '111': '1' });
        const { storage, client } = await buildRemoteStorage();
        const flagStorage = new InMemoryFlagStorage({ [MIGRATION_FLAG_KEY]: '1' });

        const result = await migrateLocalToRemote({
            local,
            remote: storage,
            client: client as unknown as VisitsApiClient,
            flagStorage,
        });

        expect(result).toEqual({ migrated: 0, skipped: true });
        expect(client.bulkPut).not.toHaveBeenCalled();
        expect(storage.getItem('111')).toBeNull();
    });

    it('only sets the migration flag when there is nothing to migrate', async () => {
        const local = new InMemoryStorage();
        const { storage, client } = await buildRemoteStorage();
        const flagStorage = new InMemoryFlagStorage();

        const result = await migrateLocalToRemote({
            local,
            remote: storage,
            client: client as unknown as VisitsApiClient,
            flagStorage,
        });

        expect(result).toEqual({ migrated: 0, skipped: false });
        expect(client.bulkPut).not.toHaveBeenCalled();
        expect(flagStorage.getItem(MIGRATION_FLAG_KEY)).toBe('1');
    });

    it('drops local entries with invalid style values', async () => {
        const local = new InMemoryStorage({
            '111': '1',
            '222': '0', // out of range (0 = unset sentinel)
            '333': '5', // out of range
            '444': 'abc', // not a number
        });
        const { storage, client } = await buildRemoteStorage();
        const flagStorage = new InMemoryFlagStorage();

        const result = await migrateLocalToRemote({
            local,
            remote: storage,
            client: client as unknown as VisitsApiClient,
            flagStorage,
        });

        expect(result.migrated).toBe(1);
        expect(client.bulkPut.mock.calls[0][0]).toEqual([{ stationId: '111', styleId: 1 }]);
    });

    it('does not set the migration flag when the upload fails', async () => {
        const local = new InMemoryStorage({ '111': '1' });
        const { storage, client } = await buildRemoteStorage();
        client.bulkPut.mockRejectedValueOnce(new Error('network down'));
        const flagStorage = new InMemoryFlagStorage();

        await expect(
            migrateLocalToRemote({
                local,
                remote: storage,
                client: client as unknown as VisitsApiClient,
                flagStorage,
            })
        ).rejects.toThrow(/network down/);

        expect(flagStorage.getItem(MIGRATION_FLAG_KEY)).toBeNull();
    });
});
