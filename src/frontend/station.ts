import type { Storage } from './storage';
import { StationsGeoJSON } from './types/geojson';

export async function fetchStations(): Promise<StationsGeoJSON> {
    const response = await fetch('../data/stations.geojson');
    return response.json();
}

export function reconcileVisits(storage: Storage, stations: StationsGeoJSON): void {
    const validStationIds = new Set(stations.features.map(feature => feature.properties.stationId));
    storage.listItems().forEach(stationId => {
        if (!validStationIds.has(stationId)) {
            storage.removeItem(stationId);
        }
    });
}
