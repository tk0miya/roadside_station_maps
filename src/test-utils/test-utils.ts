import { vi } from 'vitest';

// Create mock storage using Map
export const createMockStorage = () => {
    const storage = new Map<string, string>();
    return {
        getItem: (key: string) => storage.get(key) || null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
        listItems: () => Array.from(storage.keys()),
    };
};


// Create mock Google Maps instance with controls
export const createMockMap = () => {
    const topLeftControls: HTMLElement[] = [];
    const topCenterControls: HTMLElement[] = [];
    const topRightControls: HTMLElement[] = [];

    const controls = {
        [1]: {  // TOP_LEFT
            push: vi.fn((element: HTMLElement) => topLeftControls.push(element)),
            removeAt: vi.fn((index: number) => topLeftControls.splice(index, 1)),
            getArray: vi.fn(() => topLeftControls),
        },
        [2]: {  // TOP_CENTER
            push: vi.fn((element: HTMLElement) => topCenterControls.push(element)),
            removeAt: vi.fn((index: number) => topCenterControls.splice(index, 1)),
            getArray: vi.fn(() => topCenterControls),
        },
        [3]: {  // TOP_RIGHT
            push: vi.fn((element: HTMLElement) => topRightControls.push(element)),
            removeAt: vi.fn((index: number) => topRightControls.splice(index, 1)),
            getArray: vi.fn(() => topRightControls),
        },
    };

    return {
        controls,
    } as unknown as google.maps.Map;
};

// Create mock RoadStation
export const createMockStation = (stationId: string, overrides: Record<string, string> = {}) => {
    const defaultProperties = {
        stationId,
        internalId: `${stationId}`,
        name: `Station ${stationId}`,
        address: `Address ${stationId}`,
        hours: '9:00-17:00',
        uri: `https://example.com/station-${stationId}`,
        mapcode: '123 456*78',
        prefId: '01',
    };

    return { ...defaultProperties, ...overrides };
};

// Create mock Google Maps Data Feature
export const createMockFeature = (stationId: string, overrides: Record<string, string> = {}) => {
    const defaultProperties: Record<string, string> = {
        stationId,
        name: `Station ${stationId}`,
        address: `Address ${stationId}`,
        hours: '9:00-17:00',
        uri: `https://example.com/station-${stationId}`,
        mapcode: '123 456*78',
        prefId: '01',
    };

    const properties = { ...defaultProperties, ...overrides };

    return {
        id: `feature${stationId}`,
        getProperty: (name: string) => properties[name],
        getGeometry: () => ({
            get: () => ({ lat: 35.0, lng: 139.0 }),
        }),
    } as unknown as google.maps.Data.Feature;
};

// Create mock StationsGeoJSON
export const createMockStations = (count: number, startId: number = 18786) => ({
    type: 'FeatureCollection' as const,
    features: Array.from({ length: count }, (_, i) => ({
        type: 'Feature' as const,
        geometry: {
            type: 'Point' as const,
            coordinates: [139.0 + i * 0.1, 35.0 + i * 0.1] as [number, number]
        },
        properties: {
            stationId: `${startId + i}`,
            internalId: `${i}`,
            name: `Station ${String.fromCharCode(65 + i)}`, // Station A, B, C...
            address: '',
            hours: '',
            uri: '',
            mapcode: '',
            prefId: '01'
        }
    }))
});

// Create mock StyleManager
export const createMockStyleManager = (countByStyleReturnValue: Record<number, number>) => ({
    countByStyle: vi.fn().mockReturnValue(countByStyleReturnValue),
    getStyle: vi.fn(),
    changeStyle: vi.fn(),
    resetStyle: vi.fn(),
} as any);

// Setup Google Maps API mock
export const setupGoogleMapsMock = () => {
    (global as any).google = {
        maps: {
            ControlPosition: {
                TOP_LEFT: 1,
                TOP_CENTER: 2,
                TOP_RIGHT: 3
            }
        }
    };
};
