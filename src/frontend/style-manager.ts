import queryString from 'query-string';
import { QueryStorage } from './storage/query-storage';
import { LocalStorage } from './storage/local-storage';
import { Storage } from './storage/types';
import { RoadStation } from './road-station';
import { StationsGeoJSON } from './types/geojson';
import { StationStyleSerializer } from './storage/station-style-serializer';

export const STYLES: Record<number, google.maps.Data.StyleOptions> = {
    0: { icon: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png' },
    1: { icon: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png' },
    2: { icon: 'https://maps.google.com/mapfiles/ms/icons/purple-dot.png' },
    3: { icon: 'https://maps.google.com/mapfiles/ms/icons/yellow-dot.png' },
    4: { icon: 'https://maps.google.com/mapfiles/ms/icons/green-dot.png' },
};

export class StyleManager {
    private stations: StationsGeoJSON | null = null;

    constructor(public storage: Storage) { }

    setStations(stations: StationsGeoJSON): void {
        this.stations = stations;
        // Pass stations data to QueryStorage if it supports it
        if (this.storage instanceof QueryStorage) {
            this.storage.setStationsData(stations);
        }
    }

    private getStationId(station: RoadStation | string): string {
        return typeof station === 'string' ? station : station.stationId;
    }

    private getStyleId(stationId: string): number {
        const styleId = this.storage.getItem(stationId);
        if (styleId) {
            return parseInt(styleId);
        }
        return 0;
    }

    private setStyleId(stationId: string, styleId: number): void {
        this.storage.setItem(stationId, styleId.toString());
    }

    getStyle(station: RoadStation | string): google.maps.Data.StyleOptions {
        const stationId = this.getStationId(station);
        const styleId = this.getStyleId(stationId);
        return STYLES[styleId];
    }

    changeStyle(station: RoadStation | string): google.maps.Data.StyleOptions {
        const stationId = this.getStationId(station);
        let styleId = this.getStyleId(stationId);
        if (styleId >= 4) {
            return this.resetStyle(station);
        } else {
            styleId += 1;
            this.setStyleId(stationId, styleId);
            return STYLES[styleId];
        }
    }

    resetStyle(station: RoadStation | string): google.maps.Data.StyleOptions {
        const stationId = this.getStationId(station);
        this.storage.removeItem(stationId);
        return STYLES[0];
    }

    countByStyle(totalStations: number): Record<number, number> {
        const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };

        const stationIds = this.storage.listItems();
        stationIds.forEach(stationId => {
            const styleId = this.getStyleId(stationId);
            counts[styleId]++;
        });

        // StyleId 0 = 全道の駅数 - 設定済みの道の駅数
        const setStationsCount = Object.values(counts).reduce((sum, count) => sum + count, 0) - counts[0];
        counts[0] = totalStations - setStationsCount;

        return counts;
    }

    toQuery(): { c1?: string; c2?: string; c3?: string; c4?: string } {
        if (!this.stations) {
            throw new Error('Stations data not set. Call setStations() first.');
        }
        return StationStyleSerializer.serialize(this.storage, this.stations);
    }

}

export function getStyleManagerInstance(): StyleManager {
    const queries = queryString.parse(location.search);
    if (queries.mode === 'shared') {
        const storage = new QueryStorage();
        storage.loadFromQueries(queries);
        return new StyleManager(storage);
    }
    return new StyleManager(new LocalStorage());
}
