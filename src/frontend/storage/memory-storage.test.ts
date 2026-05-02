/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { MemoryStorage } from './memory-storage';

describe('MemoryStorage', () => {
    describe('getItem/setItem/removeItem', () => {
        it('should return null for non-existent item', () => {
            const storage = new MemoryStorage();

            expect(storage.getItem('18786')).toBeNull();
        });

        it('should store and retrieve style 1', () => {
            const storage = new MemoryStorage();

            storage.setItem('18786', '1');
            expect(storage.getItem('18786')).toBe('1');
        });

        it('should store and retrieve style 2', () => {
            const storage = new MemoryStorage();

            storage.setItem('18787', '2');
            expect(storage.getItem('18787')).toBe('2');
        });

        it('should store and retrieve style 3', () => {
            const storage = new MemoryStorage();

            storage.setItem('18788', '3');
            expect(storage.getItem('18788')).toBe('3');
        });

        it('should store and retrieve style 4', () => {
            const storage = new MemoryStorage();

            storage.setItem('18786', '4');
            expect(storage.getItem('18786')).toBe('4');
        });

        it('should overwrite existing value when setting new style', () => {
            const storage = new MemoryStorage();

            storage.setItem('18786', '1');
            storage.setItem('18786', '2');

            expect(storage.getItem('18786')).toBe('2');
        });

        it('should remove item completely', () => {
            const storage = new MemoryStorage();

            storage.setItem('18786', '3');
            storage.removeItem('18786');

            expect(storage.getItem('18786')).toBeNull();
        });
    });

    describe('listItems', () => {
        it('should return empty array when no items are stored', () => {
            const storage = new MemoryStorage();

            expect(storage.listItems()).toEqual([]);
        });

        it('should list all stored station IDs', () => {
            const storage = new MemoryStorage();

            storage.setItem('18786', '1');
            storage.setItem('18787', '2');
            storage.setItem('18788', '3');

            const items = storage.listItems();
            expect(items).toEqual(expect.arrayContaining(['18786', '18787', '18788']));
            expect(items).toHaveLength(3);
        });
    });

    describe('constructor entries', () => {
        it('should populate from initial entries', () => {
            const storage = new MemoryStorage([
                ['18786', '1'],
                ['18787', '2'],
            ]);

            expect(storage.getItem('18786')).toBe('1');
            expect(storage.getItem('18787')).toBe('2');
            expect(storage.listItems()).toHaveLength(2);
        });
    });
});
