import { Storage } from './storage/types';
import { StationsGeoJSON } from './types/geojson';

/**
 * Drop stored visit entries whose station no longer exists in the GeoJSON.
 */
export function reconcileVisits(storage: Storage, stations: StationsGeoJSON): void {
    const validStationIds = new Set(stations.features.map(feature => feature.properties.stationId));
    storage.listItems().forEach(stationId => {
        if (!validStationIds.has(stationId)) {
            storage.removeItem(stationId);
        }
    });
}
