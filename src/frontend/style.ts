import { RoadStation } from './road-station';
import type { Storage } from './storage';

export const STYLE_COUNT = 5;
const MAX_STYLE_ID = STYLE_COUNT - 1;

function getStationId(station: RoadStation | string): string {
    return typeof station === 'string' ? station : station.stationId;
}

export function getStyle(storage: Storage, station: RoadStation | string): number {
    const stationId = getStationId(station);
    const styleId = storage.getItem(stationId);
    if (styleId) {
        return parseInt(styleId);
    }
    return 0;
}

export function changeStyle(storage: Storage, station: RoadStation | string): number {
    const stationId = getStationId(station);
    const current = getStyle(storage, stationId);
    if (current >= MAX_STYLE_ID) {
        return resetStyle(storage, stationId);
    }
    const next = current + 1;
    storage.setItem(stationId, next.toString());
    return next;
}

export function resetStyle(storage: Storage, station: RoadStation | string): number {
    const stationId = getStationId(station);
    storage.removeItem(stationId);
    return 0;
}

export function entries(storage: Storage): Array<[string, number]> {
    return storage.listItems().map((stationId) => [stationId, getStyle(storage, stationId)]);
}
