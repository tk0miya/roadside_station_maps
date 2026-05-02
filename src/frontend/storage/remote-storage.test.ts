import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RemoteStorage } from './remote-storage';
import type { VisitsApiClient } from './visits-api-client';
import { VisitsApiError } from './visits-api-client';

function createClient() {
    return {
        list: vi.fn().mockResolvedValue([]),
        put: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
        bulkPut: vi.fn().mockResolvedValue(undefined),
    } satisfies Record<keyof VisitsApiClient, ReturnType<typeof vi.fn>>;
}

describe('RemoteStorage', () => {
    beforeEach(() => {
        vi.useRealTimers();
    });

    it('hydrates the cache from the API on creation', async () => {
        const client = createClient();
        client.list.mockResolvedValueOnce([
            { stationId: '111', styleId: 1, updatedAt: 1000 },
            { stationId: '222', styleId: 3, updatedAt: 2000 },
        ]);

        const storage = await RemoteStorage.create({ client: client as unknown as VisitsApiClient });

        expect(storage.getItem('111')).toBe('1');
        expect(storage.getItem('222')).toBe('3');
        expect(storage.getItem('unknown')).toBeNull();
        expect(storage.listItems().sort()).toEqual(['111', '222']);
    });

    it('returns updates synchronously from the cache', async () => {
        const client = createClient();
        const storage = await RemoteStorage.create({
            client: client as unknown as VisitsApiClient,
        });

        storage.setItem('111', '2');
        expect(storage.getItem('111')).toBe('2');

        storage.removeItem('111');
        expect(storage.getItem('111')).toBeNull();
    });

    it('debounces successive setItem calls into a single PUT', async () => {
        vi.useFakeTimers();
        const client = createClient();
        const storage = await RemoteStorage.create({
            client: client as unknown as VisitsApiClient,
            debounceMs: 100,
        });

        storage.setItem('111', '1');
        storage.setItem('111', '2');
        storage.setItem('111', '3');

        expect(client.put).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(100);
        await vi.runAllTimersAsync();

        expect(client.put).toHaveBeenCalledTimes(1);
        expect(client.put).toHaveBeenCalledWith('111', 3);
    });

    it('issues DELETE when a station is removed', async () => {
        vi.useFakeTimers();
        const client = createClient();
        client.list.mockResolvedValueOnce([{ stationId: '111', styleId: 2, updatedAt: 0 }]);
        const storage = await RemoteStorage.create({
            client: client as unknown as VisitsApiClient,
            debounceMs: 100,
        });

        storage.removeItem('111');
        await vi.advanceTimersByTimeAsync(100);
        await vi.runAllTimersAsync();

        expect(client.delete).toHaveBeenCalledWith('111');
        expect(client.put).not.toHaveBeenCalled();
    });

    it('flushes all pending writes immediately on demand', async () => {
        const client = createClient();
        const storage = await RemoteStorage.create({
            client: client as unknown as VisitsApiClient,
            debounceMs: 10_000,
        });

        storage.setItem('111', '1');
        storage.setItem('222', '4');

        expect(client.put).not.toHaveBeenCalled();

        await storage.flush();

        expect(client.put).toHaveBeenCalledTimes(2);
        expect(client.put).toHaveBeenCalledWith('111', 1);
        expect(client.put).toHaveBeenCalledWith('222', 4);
    });

    it('reports sync errors via the onSyncError callback without throwing', async () => {
        const client = createClient();
        client.put.mockRejectedValueOnce(new VisitsApiError('boom', 500));
        const onSyncError = vi.fn();
        const storage = await RemoteStorage.create({
            client: client as unknown as VisitsApiClient,
            debounceMs: 0,
            onSyncError,
        });

        storage.setItem('111', '1');
        await storage.flush();

        expect(onSyncError).toHaveBeenCalledTimes(1);
        const [error, stationId] = onSyncError.mock.calls[0];
        expect(error).toBeInstanceOf(VisitsApiError);
        expect(stationId).toBe('111');
    });

    it('removeItem on a station with no cache entry does not call the API', async () => {
        const client = createClient();
        const storage = await RemoteStorage.create({
            client: client as unknown as VisitsApiClient,
        });

        storage.removeItem('999');
        await storage.flush();

        expect(client.delete).not.toHaveBeenCalled();
    });

    it('replaceCache populates the cache without issuing network requests', async () => {
        const client = createClient();
        const storage = await RemoteStorage.create({
            client: client as unknown as VisitsApiClient,
        });

        storage.replaceCache([
            { stationId: '111', styleId: 1 },
            { stationId: '222', styleId: 4 },
        ]);

        expect(storage.listItems().sort()).toEqual(['111', '222']);
        expect(storage.getItem('111')).toBe('1');
        expect(client.put).not.toHaveBeenCalled();
        expect(client.bulkPut).not.toHaveBeenCalled();
    });
});
