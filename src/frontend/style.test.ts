import { describe, it, expect } from 'vitest';
import { changeStyle, entries, getStyle, resetStyle } from './style';
import { MemoryStorage } from './storage';

describe('getStyle', () => {
    it('should return 0 when no style is stored', () => {
        const storage = new MemoryStorage();

        expect(getStyle(storage, '001')).toBe(0);
    });

    it('should return stored style id', () => {
        const storage = new MemoryStorage();
        storage.setItem('002', '2');

        expect(getStyle(storage, '002')).toBe(2);
    });
});

describe('changeStyle', () => {
    it('should increment style from 0 to 1', () => {
        const storage = new MemoryStorage();
        storage.setItem('001', '0');

        expect(changeStyle(storage, '001')).toBe(1);
        expect(storage.getItem('001')).toBe('1');
    });

    it('should increment style from 3 to 4', () => {
        const storage = new MemoryStorage();
        storage.setItem('002', '3');

        expect(changeStyle(storage, '002')).toBe(4);
        expect(storage.getItem('002')).toBe('4');
    });

    it('should reset style when at maximum (4)', () => {
        const storage = new MemoryStorage();
        storage.setItem('003', '4');

        expect(changeStyle(storage, '003')).toBe(0);
        expect(storage.getItem('003')).toBeNull();
    });

    it('should handle no stored style (default to 0 then increment to 1)', () => {
        const storage = new MemoryStorage();

        expect(changeStyle(storage, '004')).toBe(1);
        expect(storage.getItem('004')).toBe('1');
    });
});

describe('resetStyle', () => {
    it('should remove stored style and return 0', () => {
        const storage = new MemoryStorage();
        storage.setItem('001', '3');

        expect(resetStyle(storage, '001')).toBe(0);
        expect(storage.getItem('001')).toBeNull();
    });
});

describe('entries', () => {
    it('should return an empty array when no styles are stored', () => {
        const storage = new MemoryStorage();

        expect(entries(storage)).toEqual([]);
    });

    it('should return [stationId, styleId] pairs for stored styles', () => {
        const storage = new MemoryStorage();
        storage.setItem('001', '1');
        storage.setItem('002', '4');

        expect(entries(storage).sort()).toEqual([
            ['001', 1],
            ['002', 4],
        ]);
    });
});
