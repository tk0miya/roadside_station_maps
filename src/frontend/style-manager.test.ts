/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { API_BASE_URL } from './config';
import { StyleManager, createStyleManager } from './style-manager';
import { MemoryStorage } from './storage/memory-storage';
import { RemoteStorage } from './storage/remote-storage';
import { createMockStation } from '../test-utils/test-utils';
import type { AuthState } from '@shared/auth-types';


describe('StyleManager', () => {

    describe('getStyle', () => {
        it('should return 0 when no style is stored', () => {
            const storage = new MemoryStorage();
            const styleManager = new StyleManager(storage);

            expect(styleManager.getStyle('001')).toBe(0);
        });

        it('should return stored style id', () => {
            const storage = new MemoryStorage();
            storage.setItem('002', '2');
            const styleManager = new StyleManager(storage);

            expect(styleManager.getStyle('002')).toBe(2);
        });

        it('should accept RoadStation object when style is stored', () => {
            const storage = new MemoryStorage();
            const station = createMockStation('003');
            storage.setItem('003', '1');
            const styleManager = new StyleManager(storage);

            expect(styleManager.getStyle(station)).toBe(1);
        });

        it('should accept RoadStation object when no style is stored', () => {
            const storage = new MemoryStorage();
            const station = createMockStation('004');
            const styleManager = new StyleManager(storage);

            expect(styleManager.getStyle(station)).toBe(0);
        });
    });

    describe('changeStyle', () => {
        it('should increment style from 0 to 1', () => {
            const storage = new MemoryStorage();
            storage.setItem('001', '0');
            const styleManager = new StyleManager(storage);

            expect(styleManager.changeStyle('001')).toBe(1);
            expect(storage.getItem('001')).toBe('1');
        });

        it('should increment style from 3 to 4', () => {
            const storage = new MemoryStorage();
            storage.setItem('002', '3');
            const styleManager = new StyleManager(storage);

            expect(styleManager.changeStyle('002')).toBe(4);
            expect(storage.getItem('002')).toBe('4');
        });

        it('should reset style when at maximum (4)', () => {
            const storage = new MemoryStorage();
            storage.setItem('003', '4');
            const styleManager = new StyleManager(storage);

            expect(styleManager.changeStyle('003')).toBe(0);
            expect(storage.getItem('003')).toBeNull();
        });

        it('should handle no stored style (default to 0 then increment to 1)', () => {
            const storage = new MemoryStorage();
            const styleManager = new StyleManager(storage);

            expect(styleManager.changeStyle('004')).toBe(1);
            expect(storage.getItem('004')).toBe('1');
        });

        it('should accept RoadStation object with stored style', () => {
            const storage = new MemoryStorage();
            const station = createMockStation('005');
            storage.setItem('005', '2');
            const styleManager = new StyleManager(storage);

            expect(styleManager.changeStyle(station)).toBe(3);
            expect(storage.getItem('005')).toBe('3');
        });

        it('should accept RoadStation object with no stored style', () => {
            const storage = new MemoryStorage();
            const station = createMockStation('006');
            const styleManager = new StyleManager(storage);

            expect(styleManager.changeStyle(station)).toBe(1);
            expect(storage.getItem('006')).toBe('1');
        });
    });

    describe('resetStyle', () => {
        it('should remove stored style and return 0', () => {
            const storage = new MemoryStorage();
            storage.setItem('001', '3');
            const styleManager = new StyleManager(storage);

            expect(styleManager.resetStyle('001')).toBe(0);
            expect(storage.getItem('001')).toBeNull();
        });

        it('should accept RoadStation object with stored style', () => {
            const storage = new MemoryStorage();
            const station = createMockStation('002');
            storage.setItem('002', '2');
            const styleManager = new StyleManager(storage);

            expect(styleManager.resetStyle(station)).toBe(0);
            expect(storage.getItem('002')).toBeNull();
        });

        it('should accept RoadStation object with no stored style', () => {
            const storage = new MemoryStorage();
            const station = createMockStation('003');
            const styleManager = new StyleManager(storage);

            expect(styleManager.resetStyle(station)).toBe(0);
            expect(storage.getItem('003')).toBeNull();
        });
    });

    describe('countByStyle', () => {
        it('should return all stations as style 0 when no styles are stored', () => {
            const storage = new MemoryStorage();
            const styleManager = new StyleManager(storage);

            const counts = styleManager.countByStyle(100);

            expect(counts).toEqual({ 0: 100, 1: 0, 2: 0, 3: 0, 4: 0 });
        });

        it('should count stored styles correctly', () => {
            const storage = new MemoryStorage();
            storage.setItem('001', '1');  // blue
            storage.setItem('002', '1');  // blue
            storage.setItem('003', '2');  // purple
            storage.setItem('004', '4');  // green
            const styleManager = new StyleManager(storage);

            const counts = styleManager.countByStyle(100);

            expect(counts).toEqual({ 0: 96, 1: 2, 2: 1, 3: 0, 4: 1 });
        });

        it('should calculate style 0 count correctly', () => {
            const storage = new MemoryStorage();
            storage.setItem('001', '2');  // purple stored
            storage.setItem('002', '3');  // yellow stored
            const styleManager = new StyleManager(storage);

            const counts = styleManager.countByStyle(10);

            expect(counts).toEqual({ 0: 8, 1: 0, 2: 1, 3: 1, 4: 0 });
        });

        it('should handle mixed storage scenarios', () => {
            const storage = new MemoryStorage();
            storage.setItem('station1', '0');
            storage.setItem('station2', '1');
            storage.setItem('station3', '2');
            storage.setItem('station4', '3');
            storage.setItem('station5', '4');
            storage.setItem('station6', '1');
            const styleManager = new StyleManager(storage);

            const counts = styleManager.countByStyle(20);

            expect(counts).toEqual({ 0: 15, 1: 2, 2: 1, 3: 1, 4: 1 });
        });
    });

});

describe('createStyleManager', () => {
    let originalLocation: Location;
    const guestAuth: AuthState = { user: null, idToken: null };
    const signedInAuth: AuthState = { user: { sub: 'user-1' }, idToken: 'token-abc' };

    beforeEach(() => {
        vi.clearAllMocks();
        originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            value: { ...originalLocation, search: '' },
            writable: true,
        });
    });

    afterEach(() => {
        Object.defineProperty(window, 'location', { value: originalLocation, writable: true });
    });

    it('returns an empty MemoryStorage-backed StyleManager for guests', async () => {
        const manager = await createStyleManager({
            authState: guestAuth,
            getIdToken: () => null,
        });
        expect(manager.storage).toBeInstanceOf(MemoryStorage);
        expect(manager.storage.listItems()).toEqual([]);
    });

    it('returns a MemoryStorage-backed StyleManager hydrated from the shares API when share is set', async () => {
        Object.defineProperty(window, 'location', {
            value: { ...originalLocation, search: '?share=abc-123' },
            writable: true,
        });

        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(
                JSON.stringify({
                    visits: [
                        { stationId: '111', styleId: 1, updatedAt: 1000 },
                        { stationId: '222', styleId: 4, updatedAt: 1000 },
                    ],
                }),
                { status: 200, headers: { 'Content-Type': 'application/json' } }
            )
        );

        try {
            const manager = await createStyleManager({
                authState: signedInAuth,
                getIdToken: () => 'token-abc',
            });

            expect(manager.storage).toBeInstanceOf(MemoryStorage);
            expect(manager.storage.getItem('111')).toBe('1');
            expect(manager.storage.getItem('222')).toBe('4');
            expect(fetchSpy).toHaveBeenCalledWith(
                `${API_BASE_URL}/shares/abc-123`,
                expect.objectContaining({ method: 'GET' })
            );
        } finally {
            fetchSpy.mockRestore();
        }
    });

    it('returns a RemoteStorage-backed StyleManager hydrated from the API for signed-in users', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(
                JSON.stringify({
                    visits: [{ stationId: '111', styleId: 2, updatedAt: 1000 }],
                }),
                { status: 200, headers: { 'Content-Type': 'application/json' } }
            )
        );

        try {
            const manager = await createStyleManager({
                authState: signedInAuth,
                getIdToken: () => 'token-abc',
            });

            expect(manager.storage).toBeInstanceOf(RemoteStorage);
            expect(manager.storage.getItem('111')).toBe('2');
            expect(fetchSpy).toHaveBeenCalledWith(
                `${API_BASE_URL}/api/visits`,
                expect.objectContaining({
                    method: 'GET',
                    headers: expect.objectContaining({ Authorization: 'Bearer token-abc' }),
                })
            );
        } finally {
            fetchSpy.mockRestore();
        }
    });
});
