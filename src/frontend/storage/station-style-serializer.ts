import { Storage } from './types';
import { StationsGeoJSON } from '../types/geojson';

function encode(array: Uint8Array): string {
    return btoa(String.fromCharCode.apply(null, Array.from(array)));
}

interface Queries {
    c1?: string;
    c2?: string;
    c3?: string;
    c4?: string;
}

export class StationStyleSerializer {
    static serialize(storage: Storage, stations: StationsGeoJSON): Queries {
        const queries: Queries = {};

        // Create station ID to internal ID mapping
        const stationIdToInternalId = new Map<string, string>();
        stations.features.forEach(feature => {
            stationIdToInternalId.set(feature.properties.stationId, feature.properties.internalId);
        });

        // Group internal IDs by style ID
        const internalIdsByStyle: Record<string, number[]> = { '1': [], '2': [], '3': [], '4': [] };
        
        storage.listItems().forEach(stationId => {
            const styleId = storage.getItem(stationId);
            const internalId = stationIdToInternalId.get(stationId);
            
            if (styleId && internalId && internalIdsByStyle[styleId]) {
                internalIdsByStyle[styleId].push(parseInt(internalId));
            }
        });

        const convertInternalIdsToQuery = (internalIds: number[]): string => {
            if (internalIds.length === 0) return '';

            const maxId = Math.max(...internalIds);
            const size = Math.ceil((maxId + 1) / 8);
            const buf = new Uint8Array(size);

            internalIds.forEach(id => {
                const idx = Math.floor(id / 8);
                const shift = id % 8;
                buf[idx] |= 1 << shift;
            });

            return encode(buf);
        };

        queries.c1 = convertInternalIdsToQuery(internalIdsByStyle['1']);
        queries.c2 = convertInternalIdsToQuery(internalIdsByStyle['2']);
        queries.c3 = convertInternalIdsToQuery(internalIdsByStyle['3']);
        queries.c4 = convertInternalIdsToQuery(internalIdsByStyle['4']);

        return queries;
    }
}