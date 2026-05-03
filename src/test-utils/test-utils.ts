import { vi } from 'vitest';


// Create mock Google Maps instance with controls and Data layer
export const createMockMap = () => {
    const topLeftControls: HTMLElement[] = [];
    const topCenterControls: HTMLElement[] = [];
    const topRightControls: HTMLElement[] = [];
    const rightTopControls: HTMLElement[] = [];

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
        [7]: {  // RIGHT_TOP
            push: vi.fn((element: HTMLElement) => rightTopControls.push(element)),
            removeAt: vi.fn((index: number) => rightTopControls.splice(index, 1)),
            getArray: vi.fn(() => rightTopControls),
        },
    };

    let features: google.maps.Data.Feature[] = [];
    const data = {
        addGeoJson: vi.fn(),
        addListener: vi.fn(() => ({ remove: vi.fn() })),
        setStyle: vi.fn(),
        overrideStyle: vi.fn(),
        forEach: vi.fn((cb: (f: google.maps.Data.Feature) => void) => features.forEach(cb)),
        remove: vi.fn((f: google.maps.Data.Feature) => {
            features = features.filter((x) => x !== f);
        }),
        _setFeatures: (fs: google.maps.Data.Feature[]) => {
            features = fs;
        },
    };

    return {
        controls,
        data,
    } as unknown as google.maps.Map & { data: typeof data };
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

// Setup Google Maps API mock
export const setupGoogleMapsMock = () => {
    (global as any).google = {
        maps: {
            ControlPosition: {
                TOP_LEFT: 1,
                TOP_CENTER: 2,
                TOP_RIGHT: 3,
                RIGHT_TOP: 7
            }
        }
    };
};

// Build a JSON Response for fetch mocks
export const jsonResponse = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });

// Build an empty-body Response for fetch mocks
export const emptyResponse = (status = 204): Response => new Response(null, { status });

// Base64URL encode a UTF-8 string (used for fake JWT segments)
const base64UrlEncode = (input: string): string =>
    Buffer.from(input, 'utf8')
        .toString('base64')
        .replace(/=+$/, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

// Build an unsigned Google ID token. Defaults to a valid set of claims for
// the given audience; pass overrides (including `undefined` to omit a claim)
// to construct invalid variants.
export const buildIdToken = (
    audience: string,
    overrides: Record<string, unknown> = {}
): string => {
    const payload = {
        sub: 'user-1',
        iss: 'https://accounts.google.com',
        aud: audience,
        exp: 9999999999,
        ...overrides,
    };
    const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const body = base64UrlEncode(JSON.stringify(payload));
    return `${header}.${body}.sig`;
};
