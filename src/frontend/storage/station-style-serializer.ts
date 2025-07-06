import { Storage } from './types';
import { StationsGeoJSON } from '../types/geojson';
import { QueryStorage } from './query-storage';

function encode(array: Uint8Array): string {
    return btoa(String.fromCharCode.apply(null, Array.from(array)));
}

function decode(buf: string | undefined): Uint8Array {
    if (buf) {
        try {
            return new Uint8Array(atob(buf).split("").map((c) => {
                return c.charCodeAt(0);
            }));
        } catch (e) {
            console.log(e);
        }
    }
    return new Uint8Array();
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

    static deserialize(storage: QueryStorage, stations: StationsGeoJSON): void {
        // Clear existing data
        storage.clearItems();

        // Create internal ID to station ID mapping
        const internalIdToStationId = new Map<string, string>();
        stations.features.forEach(feature => {
            internalIdToStationId.set(feature.properties.internalId, feature.properties.stationId);
        });

        const processStyle = (encodedData: string | undefined, styleId: string): void => {
            const buf = decode(encodedData);

            for (let i = 0; i < buf.length; i++) {
                for (let bit = 0; bit < 8; bit++) {
                    if (buf[i] & (1 << bit)) {
                        const internalId = (i * 8 + bit).toString();
                        const stationId = internalIdToStationId.get(internalId);
                        if (stationId) {
                            storage.setItem(stationId, styleId);
                        }
                    }
                }
            }
        };

        // Process each style from the queries stored in storage
        processStyle(storage.queries.c1, '1');
        processStyle(storage.queries.c2, '2');
        processStyle(storage.queries.c3, '3');
        processStyle(storage.queries.c4, '4');
    }
}