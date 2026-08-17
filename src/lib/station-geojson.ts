import * as fs from 'node:fs';
import type { Station } from './types.js';

// Where a station goes when its page carried no parsable Google Maps link.
// This is 35N 135E in Nishiwaki, Hyogo -- the point Japan calls its navel.
// Dropping such a station would hide it from the map and undercount it in the
// station counter, so it gets a marker here instead. Nothing tells the viewer
// this one is nominal, which is tolerable because coordinates can realistically
// only be missing in the days after a station is registered -- the weekly
// update replaces them as soon as the site publishes the real ones.
export const FALLBACK_COORDINATES: [number, number] = [135, 35];

interface StationFeature {
    type: 'Feature';
    geometry: {
        type: 'Point';
        // GeoJSON orders a position as [longitude, latitude].
        coordinates: [number, number];
    };
    properties: {
        prefId: string;
        stationId: string;
        name: string;
        address: string;
        tel: string;
        hours: string;
        uri: string;
        mapcode: string;
    };
}

export function toFeature(station: Station): StationFeature {
    const coordinates: [number, number] =
        station.lat === null || station.lng === null ? FALLBACK_COORDINATES : [station.lng, station.lat];

    return {
        type: 'Feature',
        geometry: {
            type: 'Point',
            coordinates,
        },
        properties: {
            prefId: station.prefId,
            stationId: station.stationId,
            name: station.name,
            address: station.address,
            tel: station.tel,
            hours: station.hours,
            uri: station.uri,
            mapcode: station.mapcode,
        },
    };
}

// One feature per line, so that `grep` finds a whole station and the weekly
// data-update diff reads station by station. The result is still plain JSON --
// the newlines sit between array elements, where JSON allows whitespace.
//
// Stations are ordered by stationId rather than left in crawl order: the site
// is free to reshuffle its listings, and that would otherwise rewrite the whole
// file even when no station actually changed.
export function serialize(stations: Station[]): string {
    const features = [...stations]
        .sort((a, b) => Number.parseInt(a.stationId, 10) - Number.parseInt(b.stationId, 10))
        .map((station) => JSON.stringify(toFeature(station)));

    return `{"type":"FeatureCollection","features":[\n${features.join(',\n')}\n]}\n`;
}

export function dump(stations: Station[], filename: string): void {
    fs.writeFileSync(filename, serialize(stations), 'utf-8');
}
