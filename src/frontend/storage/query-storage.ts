
import { Storage } from './types';
import { StationsGeoJSON } from '../types/geojson';

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

export class QueryStorage implements Storage {
    mode: string = 'shared';
    c1: Set<string> = new Set();
    c2: Set<string> = new Set();
    c3: Set<string> = new Set();
    c4: Set<string> = new Set();
    private pendingQueries: Queries | null = null;
    private stations: StationsGeoJSON | null = null;

    setStationsData(stations: StationsGeoJSON): void {
        this.stations = stations;

        // Process pending queries if any
        if (this.pendingQueries) {
            this.processPendingQueries(this.pendingQueries);
            this.pendingQueries = null;
        }
    }

    private getInternalIdMapping(): Map<string, string> {
        const mapping = new Map<string, string>();
        if (this.stations) {
            this.stations.features.forEach(feature => {
                mapping.set(feature.properties.internalId, feature.properties.stationId);
            });
        }
        return mapping;
    }

    private processPendingQueries(queries: Queries): void {
        // Convert internalId bitmaps back to stationId sets
        const internalIdToStationId = this.getInternalIdMapping();

        const processStyle = (encodedData: string | undefined): Set<string> => {
            const resultSet = new Set<string>();
            if (!encodedData) {
                return resultSet;
            }

            const buf = decode(encodedData);

            for (let i = 0; i < buf.length; i++) {
                for (let bit = 0; bit < 8; bit++) {
                    if (buf[i] & (1 << bit)) {
                        const internalId = (i * 8 + bit).toString();
                        const stationId = internalIdToStationId.get(internalId);
                        if (stationId) {
                            resultSet.add(stationId);
                        }
                    }
                }
            }
            return resultSet;
        };

        this.c1 = processStyle(queries.c1);
        this.c2 = processStyle(queries.c2);
        this.c3 = processStyle(queries.c3);
        this.c4 = processStyle(queries.c4);
    }

    loadFromQueries(queries: Queries): void {
        // Store queries for later processing when stations data is available
        this.pendingQueries = queries;
    }

    getItem(key: string): string | null {
        // Work with stationId directly
        if (this.c1.has(key)) {
            return "1";
        }
        if (this.c2.has(key)) {
            return "2";
        }
        if (this.c3.has(key)) {
            return "3";
        }
        if (this.c4.has(key)) {
            return "4";
        }
        return null;
    }

    setItem(key: string, value: string): void {
        // Remove from all sets first
        this.removeItem(key);

        // Add to appropriate set
        if (value === "1") this.c1.add(key);
        else if (value === "2") this.c2.add(key);
        else if (value === "3") this.c3.add(key);
        else if (value === "4") this.c4.add(key);
    }

    removeItem(key: string): void {
        this.c1.delete(key);
        this.c2.delete(key);
        this.c3.delete(key);
        this.c4.delete(key);
    }

    listItems(): string[] {
        return [...this.c1, ...this.c2, ...this.c3, ...this.c4];
    }
}
