import { describe, it, expect } from 'vitest';
import { reconcileVisits } from './reconcile-visits';
import { MemoryStorage } from './storage/memory-storage';
import { createMockStations } from '../test-utils/test-utils';

describe('reconcileVisits', () => {
    it('removes stored entries for stations not present in the GeoJSON', () => {
        const storage = new MemoryStorage();
        storage.setItem('18786', '1');  // exists in mock stations
        storage.setItem('99999', '2');  // does not exist

        reconcileVisits(storage, createMockStations(3));

        expect(storage.getItem('18786')).toBe('1');
        expect(storage.getItem('99999')).toBeNull();
    });

    it('keeps all stored entries when every stationId exists in the GeoJSON', () => {
        const storage = new MemoryStorage();
        storage.setItem('18786', '1');
        storage.setItem('18787', '2');

        reconcileVisits(storage, createMockStations(3));

        expect(storage.getItem('18786')).toBe('1');
        expect(storage.getItem('18787')).toBe('2');
    });

    it('does nothing when storage is empty', () => {
        const storage = new MemoryStorage();

        reconcileVisits(storage, createMockStations(3));

        expect(storage.listItems()).toEqual([]);
    });
});
