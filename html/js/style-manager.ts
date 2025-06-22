import queryString from 'query-string';
import { QueryStorage } from './storage/queries';

interface Style {
    icon: string;
}

const STYLES: Record<number, Style> = {
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

    getStyleId(stationId: string): number {
        const styleId = this.storage.getItem(stationId);
        if (styleId) {
            return parseInt(styleId);
        }
        return 0;
    }

    setStyleId(stationId: string, styleId: number): void {
        this.storage.setItem(stationId, styleId.toString());
    }

    getStyle(stationId: string): Style {
        const styleId = this.getStyleId(stationId);
        return STYLES[styleId];
    }

    changeStyle(stationId: string): Style {
        let styleId = this.getStyleId(stationId);
        if (styleId >= 4) {
            styleId = 0;
        } else {
            styleId += 1;
        }
        this.setStyleId(stationId, styleId);
        return STYLES[styleId];
    }
}

export function getStyleManagerInstance(): StyleManager {
    const queries = queryString.parse(location.search);
    if (queries.mode === 'shared') {
        const storage = new QueryStorage();
        storage.load_from_queries(queries);
        return new StyleManager(storage);
    }
    return new StyleManager(localStorage);
}

export type { Style, Storage };