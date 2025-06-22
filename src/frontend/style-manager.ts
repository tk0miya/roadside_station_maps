import queryString from 'query-string';
import { QueryStorage } from './storage/queries';
import { RoadStation } from './roadstation';

const STYLES: Record<number, google.maps.Data.StyleOptions> = {
    0: { icon: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png' },
    1: { icon: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png' },
    2: { icon: 'https://maps.google.com/mapfiles/ms/icons/purple-dot.png' },
    3: { icon: 'https://maps.google.com/mapfiles/ms/icons/yellow-dot.png' },
    4: { icon: 'https://maps.google.com/mapfiles/ms/icons/green-dot.png' },
};

interface Storage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

export class StyleManager {
    constructor(private storage: Storage) {}

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
}

export function getStyleManagerInstance(): StyleManager {
    const queries = queryString.parse(location.search);
    if (queries.mode === 'shared') {
        const storage = new QueryStorage();
        storage.loadFromQueries(queries);
        return new StyleManager(storage);
    }
    return new StyleManager(localStorage);
}