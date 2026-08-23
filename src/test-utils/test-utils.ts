import { vi } from 'vitest';

// Event plumbing shared by the mock map and its mock Data layer: `addListener`
// records the handler (and can unregister it), `_emit` fires what is registered.
const createListenerRegistry = () => {
    const listeners: Record<string, ((event: unknown) => void)[]> = {};

    return {
        addListener: vi.fn((eventName: string, cb: (event: unknown) => void) => {
            const list = listeners[eventName] ?? [];
            list.push(cb);
            listeners[eventName] = list;
            return {
                remove: vi.fn(() => {
                    listeners[eventName] = (listeners[eventName] ?? []).filter((c) => c !== cb);
                }),
            };
        }),
        _emit: (eventName: string, event: unknown) => {
            for (const cb of listeners[eventName] ?? []) {
                cb(event);
            }
        },
    };
};

// Create mock Google Maps instance with controls, events and Data layer
export const createMockMap = () => {
    const topLeftControls: HTMLElement[] = [];
    const topCenterControls: HTMLElement[] = [];
    const topRightControls: HTMLElement[] = [];
    const leftTopControls: HTMLElement[] = [];
    const rightTopControls: HTMLElement[] = [];

    const controls = {
        // TOP_LEFT
        1: {
            push: vi.fn((element: HTMLElement) => topLeftControls.push(element)),
            removeAt: vi.fn((index: number) => topLeftControls.splice(index, 1)),
            getArray: vi.fn(() => topLeftControls),
        },
        // TOP_CENTER
        2: {
            push: vi.fn((element: HTMLElement) => topCenterControls.push(element)),
            removeAt: vi.fn((index: number) => topCenterControls.splice(index, 1)),
            getArray: vi.fn(() => topCenterControls),
        },
        // TOP_RIGHT
        3: {
            push: vi.fn((element: HTMLElement) => topRightControls.push(element)),
            removeAt: vi.fn((index: number) => topRightControls.splice(index, 1)),
            getArray: vi.fn(() => topRightControls),
        },
        // LEFT_TOP
        5: {
            push: vi.fn((element: HTMLElement) => leftTopControls.push(element)),
            removeAt: vi.fn((index: number) => leftTopControls.splice(index, 1)),
            getArray: vi.fn(() => leftTopControls),
        },
        // RIGHT_TOP
        7: {
            push: vi.fn((element: HTMLElement) => rightTopControls.push(element)),
            removeAt: vi.fn((index: number) => rightTopControls.splice(index, 1)),
            getArray: vi.fn(() => rightTopControls),
        },
    };

    let features: google.maps.Data.Feature[] = [];
    const dataEvents = createListenerRegistry();
    const data = {
        addGeoJson: vi.fn(),
        addListener: dataEvents.addListener,
        setStyle: vi.fn(),
        overrideStyle: vi.fn(),
        add: vi.fn((options: google.maps.Data.FeatureOptions) => {
            const properties = (options.properties ?? {}) as Record<string, unknown>;
            const feature = {
                getProperty: (name: string) => properties[name],
                getGeometry: () => options.geometry,
            } as unknown as google.maps.Data.Feature;
            features.push(feature);
            return feature;
        }),
        forEach: vi.fn((cb: (f: google.maps.Data.Feature) => void) => features.forEach(cb)),
        remove: vi.fn((f: google.maps.Data.Feature) => {
            features = features.filter((x) => x !== f);
        }),
        _setFeatures: (fs: google.maps.Data.Feature[]) => {
            features = fs;
        },
        _emit: dataEvents._emit,
    };

    const mapEvents = createListenerRegistry();

    const setOptions = vi.fn();

    return {
        controls,
        data,
        setOptions,
        addListener: mapEvents.addListener,
        _emit: mapEvents._emit,
    } as unknown as google.maps.Map & {
        data: typeof data;
        setOptions: typeof setOptions;
        _emit: typeof mapEvents._emit;
    };
};

// Create a mock google.maps.LatLng, the shape the Maps API hands back from a
// map event and from a feature's geometry.
export const createMockLatLng = (lat: number, lng: number) =>
    ({
        lat: () => lat,
        lng: () => lng,
    }) as google.maps.LatLng;

// Create mock Google Maps Data Feature
export const createMockFeature = (
    stationId: string,
    overrides: Record<string, string> = {},
    position: { lat: number; lng: number } = { lat: 35.0, lng: 139.0 }
) => {
    const defaultProperties: Record<string, string> = {
        stationId,
        name: `Station ${stationId}`,
        address: `Address ${stationId}`,
        hours: '9:00-17:00',
        uri: `https://example.com/station-${stationId}`,
        mapcode: '123 456*78',
        prefId: '01',
        prefName: '北海道',
    };

    const properties = { ...defaultProperties, ...overrides };

    return {
        id: `feature${stationId}`,
        getProperty: (name: string) => properties[name],
        getGeometry: () => ({
            get: () => createMockLatLng(position.lat, position.lng),
        }),
    } as unknown as google.maps.Data.Feature;
};

// Create a mock feature standing for a custom stop: no station data, just the
// custom-stop property and a position.
export const createMockCustomStop = (lat = 36.0, lng = 140.0) =>
    ({
        getProperty: (name: string) => (name === 'customStop' ? true : undefined),
        getGeometry: () => ({
            get: () => createMockLatLng(lat, lng),
        }),
    }) as unknown as google.maps.Data.Feature;

// Create mock StationsGeoJSON
export const createMockStations = (count: number, startId = 18786) => ({
    type: 'FeatureCollection' as const,
    features: Array.from({ length: count }, (_, i) => ({
        type: 'Feature' as const,
        geometry: {
            type: 'Point' as const,
            coordinates: [139.0 + i * 0.1, 35.0 + i * 0.1] as [number, number],
        },
        properties: {
            stationId: `${startId + i}`,
            name: `Station ${String.fromCharCode(65 + i)}`, // Station A, B, C...
            address: '',
            hours: '',
            uri: '',
            mapcode: '',
            prefId: '01',
            prefName: '北海道',
        },
    })),
});

// Setup Google Maps API mock
export const setupGoogleMapsMock = () => {
    (global as any).google = {
        maps: {
            ControlPosition: {
                TOP_LEFT: 1,
                TOP_CENTER: 2,
                TOP_RIGHT: 3,
                LEFT_TOP: 5,
                RIGHT_TOP: 7,
            },
            Size: class {
                constructor(
                    public width: number,
                    public height: number
                ) {}
            },
            Point: class {
                constructor(
                    public x: number,
                    public y: number
                ) {}
            },
            Data: {
                Point: class {
                    constructor(private readonly position: google.maps.LatLng) {}
                    get() {
                        return this.position;
                    }
                },
            },
        },
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
    Buffer.from(input, 'utf8').toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

// Build an unsigned backend-issued session token. The frontend never verifies
// the signature so the trailing `sig` segment is irrelevant.
export const buildSessionToken = (overrides: Record<string, unknown> = {}): string => {
    const payload = {
        sub: 'user-1',
        exp: 9999999999,
        ...overrides,
    };
    const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = base64UrlEncode(JSON.stringify(payload));
    return `${header}.${body}.sig`;
};
