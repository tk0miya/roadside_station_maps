/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StyleManager, createStyleManager, getStyleManagerInstance } from './style-manager';
import { QueryStorage } from './storage/query-storage';
import { LocalStorage } from './storage/local-storage';
import { RemoteStorage } from './storage/remote-storage';
import { createMockStation, createMockStations } from '../test-utils/test-utils';
import type { AuthState } from '@shared/auth-types';


describe('StyleManager', () => {

    describe('getStyle', () => {
        it('should return default style when no style is stored', () => {
            const storage = new QueryStorage();
            const styleManager = new StyleManager(storage);

            const style = styleManager.getStyle('001');

            expect(style).toEqual({ icon: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png' });
        });

        it('should return stored style', () => {
            const storage = new QueryStorage();
            storage.setItem('002', '2');
            const styleManager = new StyleManager(storage);

            const style = styleManager.getStyle('002');

            expect(style).toEqual({ icon: 'https://maps.google.com/mapfiles/ms/icons/purple-dot.png' });
        });

        it('should accept RoadStation object when style is stored', () => {
            const storage = new QueryStorage();
            const station = createMockStation('003');
            storage.setItem('003', '1');
            const styleManager = new StyleManager(storage);

            const style = styleManager.getStyle(station);

            expect(style).toEqual({ icon: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png' });
        });

        it('should accept RoadStation object when no style is stored', () => {
            const storage = new QueryStorage();
            const station = createMockStation('004');
            const styleManager = new StyleManager(storage);

            const style = styleManager.getStyle(station);

            expect(style).toEqual({ icon: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png' });
        });
    });

    describe('changeStyle', () => {
        it('should increment style from 0 to 1', () => {
            const storage = new QueryStorage();
            storage.setItem('001', '0');
            const styleManager = new StyleManager(storage);

            const newStyle = styleManager.changeStyle('001');

            expect(newStyle).toEqual({ icon: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png' });
            expect(storage.getItem('001')).toBe('1');
        });

        it('should increment style from 3 to 4', () => {
            const storage = new QueryStorage();
            storage.setItem('002', '3');
            const styleManager = new StyleManager(storage);

            const newStyle = styleManager.changeStyle('002');

            expect(newStyle).toEqual({ icon: 'https://maps.google.com/mapfiles/ms/icons/green-dot.png' });
            expect(storage.getItem('002')).toBe('4');
        });

        it('should reset style when at maximum (4)', () => {
            const storage = new QueryStorage();
            storage.setItem('003', '4');
            const styleManager = new StyleManager(storage);

            const newStyle = styleManager.changeStyle('003');

            expect(newStyle).toEqual({ icon: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png' });
            expect(storage.getItem('003')).toBeNull();
        });

        it('should handle no stored style (default to 0 then increment to 1)', () => {
            const storage = new QueryStorage();
            const styleManager = new StyleManager(storage);

            const newStyle = styleManager.changeStyle('004');

            expect(newStyle).toEqual({ icon: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png' });
            expect(storage.getItem('004')).toBe('1');
        });

        it('should accept RoadStation object with stored style', () => {
            const storage = new QueryStorage();
            const station = createMockStation('005');
            storage.setItem('005', '2');
            const styleManager = new StyleManager(storage);

            const newStyle = styleManager.changeStyle(station);

            expect(newStyle).toEqual({ icon: 'https://maps.google.com/mapfiles/ms/icons/yellow-dot.png' });
            expect(storage.getItem('005')).toBe('3');
        });

        it('should accept RoadStation object with no stored style', () => {
            const storage = new QueryStorage();
            const station = createMockStation('006');
            const styleManager = new StyleManager(storage);

            const newStyle = styleManager.changeStyle(station);

            expect(newStyle).toEqual({ icon: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png' });
            expect(storage.getItem('006')).toBe('1');
        });
    });

    describe('resetStyle', () => {
        it('should remove stored style and return default', () => {
            const storage = new QueryStorage();
            storage.setItem('001', '3');
            const styleManager = new StyleManager(storage);

            const style = styleManager.resetStyle('001');

            expect(style).toEqual({ icon: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png' });
            expect(storage.getItem('001')).toBeNull();
        });

        it('should accept RoadStation object with stored style', () => {
            const storage = new QueryStorage();
            const station = createMockStation('002');
            storage.setItem('002', '2');
            const styleManager = new StyleManager(storage);

            const style = styleManager.resetStyle(station);

            expect(style).toEqual({ icon: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png' });
            expect(storage.getItem('002')).toBeNull();
        });

        it('should accept RoadStation object with no stored style', () => {
            const storage = new QueryStorage();
            const station = createMockStation('003');
            const styleManager = new StyleManager(storage);

            const style = styleManager.resetStyle(station);

            expect(style).toEqual({ icon: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png' });
            expect(storage.getItem('003')).toBeNull();
        });
    });

    describe('countByStyle', () => {
        it('should return all stations as style 0 when no styles are stored', () => {
            const storage = new QueryStorage();
            const styleManager = new StyleManager(storage);

            const counts = styleManager.countByStyle(100);

            expect(counts).toEqual({ 0: 100, 1: 0, 2: 0, 3: 0, 4: 0 });
        });

        it('should count stored styles correctly', () => {
            const storage = new QueryStorage();
            storage.setItem('001', '1');  // blue
            storage.setItem('002', '1');  // blue
            storage.setItem('003', '2');  // purple
            storage.setItem('004', '4');  // green
            const styleManager = new StyleManager(storage);

            const counts = styleManager.countByStyle(100);

            expect(counts).toEqual({ 0: 96, 1: 2, 2: 1, 3: 0, 4: 1 });
        });

        it('should calculate style 0 count correctly', () => {
            const storage = new QueryStorage();
            storage.setItem('001', '2');  // purple stored
            storage.setItem('002', '3');  // yellow stored
            const styleManager = new StyleManager(storage);

            const counts = styleManager.countByStyle(10);

            expect(counts).toEqual({ 0: 8, 1: 0, 2: 1, 3: 1, 4: 0 });
        });

        it('should handle mixed storage scenarios', () => {
            const storage = new QueryStorage();
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

    describe('setStations', () => {
        beforeEach(() => {
            localStorage.clear();
        });

        it('should remove stored entries for stations not present in the GeoJSON (LocalStorage)', () => {
            const storage = new LocalStorage();
            storage.setItem('18786', '1');  // exists in mock stations
            storage.setItem('99999', '2');  // does not exist
            const styleManager = new StyleManager(storage);

            const mockStations = createMockStations(3);
            styleManager.setStations(mockStations);

            expect(storage.getItem('18786')).toBe('1');
            expect(storage.getItem('99999')).toBeNull();
        });

        it('should keep all stored entries when every stationId exists in the GeoJSON', () => {
            const storage = new LocalStorage();
            storage.setItem('18786', '1');
            storage.setItem('18787', '2');
            const styleManager = new StyleManager(storage);

            const mockStations = createMockStations(3);
            styleManager.setStations(mockStations);

            expect(storage.getItem('18786')).toBe('1');
            expect(storage.getItem('18787')).toBe('2');
        });

        it('should reflect cleanup in countByStyle (LocalStorage)', () => {
            const storage = new LocalStorage();
            storage.setItem('18786', '1');  // valid
            storage.setItem('99999', '2');  // invalid (removed station)
            const styleManager = new StyleManager(storage);

            const mockStations = createMockStations(3);
            styleManager.setStations(mockStations);

            const counts = styleManager.countByStyle(3);
            expect(counts).toEqual({ 0: 2, 1: 1, 2: 0, 3: 0, 4: 0 });
        });
    });

    describe('toQuery', () => {
        it('should generate empty queries when storage is empty', () => {
            const queryStorage = new QueryStorage();
            const styleManager = new StyleManager(queryStorage);
            
            const mockStations = createMockStations(3);
            styleManager.setStations(mockStations);
            
            const result = styleManager.toQuery();
            
            // All queries should be empty strings
            expect(result.c1).toBe('');
            expect(result.c2).toBe('');
            expect(result.c3).toBe('');
            expect(result.c4).toBe('');
        });

        it('should generate queries from storage data', () => {
            const queryStorage = new QueryStorage();
            const styleManager = new StyleManager(queryStorage);
            
            const mockStations = createMockStations(3);
            styleManager.setStations(mockStations);
            
            // Set some data in the QueryStorage
            queryStorage.setItem('18786', '1');
            queryStorage.setItem('18787', '2');
            
            const result = styleManager.toQuery();
            
            // Should return actual query structure
            expect(result).toHaveProperty('c1');
            expect(result).toHaveProperty('c2');
            expect(result).toHaveProperty('c3');
            expect(result).toHaveProperty('c4');
            
            // Should have specific encoded values based on our QueryStorage setup
            // '18786' (internalId 0) with style '1' -> c1: 'AQ' (bit 0 set, URL-safe)
            // '18787' (internalId 1) with style '2' -> c2: 'Ag' (bit 1 set, URL-safe)
            expect(result.c1).toBe('AQ');
            expect(result.c2).toBe('Ag');
            expect(result.c3).toBe('');
            expect(result.c4).toBe('');
        });
    });
});

describe('getStyleManagerInstance', () => {
    let originalLocation: Location;

    beforeEach(() => {
        vi.clearAllMocks();
        // Store original location
        originalLocation = window.location;
    });

    afterEach(() => {
        // Restore original location
        Object.defineProperty(window, 'location', {
            value: originalLocation,
            writable: true,
        });
    });

    it('should use localStorage when mode is not shared', async () => {
        // Mock location without mode=shared
        Object.defineProperty(window, 'location', {
            value: {
                ...originalLocation,
                search: '?foo=bar',
            },
            writable: true,
        });

        const instance = getStyleManagerInstance();
        expect(instance).toBeInstanceOf(StyleManager);
        expect(instance.storage).toBeInstanceOf(LocalStorage);
    });

    it('should use QueryStorage when mode is shared', async () => {
        // Mock location with mode=shared
        Object.defineProperty(window, 'location', {
            value: {
                ...originalLocation,
                search: '?mode=shared&foo=bar',
            },
            writable: true,
        });

        const instance = getStyleManagerInstance();
        expect(instance).toBeInstanceOf(StyleManager);
        expect(instance.storage).toBeInstanceOf(QueryStorage);
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

    it('returns a LocalStorage-backed StyleManager for guests', async () => {
        const manager = await createStyleManager({
            authState: guestAuth,
            getIdToken: () => null,
        });
        expect(manager.storage).toBeInstanceOf(LocalStorage);
    });

    it('returns a QueryStorage-backed StyleManager when mode=shared overrides auth', async () => {
        Object.defineProperty(window, 'location', {
            value: { ...originalLocation, search: '?mode=shared&c1=AAAA' },
            writable: true,
        });

        const manager = await createStyleManager({
            authState: signedInAuth,
            getIdToken: () => 'token-abc',
        });

        expect(manager.storage).toBeInstanceOf(QueryStorage);
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
                apiBaseUrl: 'https://api.example.com',
            });

            expect(manager.storage).toBeInstanceOf(RemoteStorage);
            expect(manager.storage.getItem('111')).toBe('2');
            expect(fetchSpy).toHaveBeenCalledWith(
                'https://api.example.com/api/visits',
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
