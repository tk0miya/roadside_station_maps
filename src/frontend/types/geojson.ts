export interface StationProperties {
    stationId: string;
    internalId: string;
    name: string;
    address: string;
    hours: string;
    uri: string;
    mapcode: string;
    prefId: string;
}

export interface StationFeature {
    type: 'Feature';
    geometry: {
        type: 'Point';
        coordinates: [number, number]; // [longitude, latitude]
    };
    properties: StationProperties;
}

export interface StationsGeoJSON {
    type: 'FeatureCollection';
    features: StationFeature[];
}