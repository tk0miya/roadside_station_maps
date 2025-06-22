// Create mock storage using Map
export const createMockStorage = () => {
    const storage = new Map<string, string>();
    return {
        getItem: (key: string) => storage.get(key) || null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
    };
};


// Create mock Google Maps instance with controls
export const createMockMap = () => {
    const topLeftControls: HTMLElement[] = [];
    const topCenterControls: HTMLElement[] = [];

    const controls = {
        [1]: topLeftControls,  // TOP_LEFT
        [2]: topCenterControls, // TOP_CENTER
    };

    return {
        controls,
    } as unknown as google.maps.Map;
};

// Create mock RoadStation
export const createMockStation = (stationId: string, overrides: Record<string, string> = {}) => {
    const defaultProperties = {
        stationId,
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
