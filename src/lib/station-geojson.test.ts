import { describe, expect, it } from 'vitest';
import { FALLBACK_COORDINATES, serialize, toFeature } from './station-geojson';
import type { Station } from './types';

function station(overrides: Partial<Station> = {}): Station {
    return {
        prefId: '23',
        prefName: '神奈川県',
        stationId: '19150',
        name: '箱根峠',
        address: '250-0521 神奈川県足柄下郡箱根町箱根381-22',
        tel: '0460-83-7310',
        hours: '9:00〜17:00',
        uri: 'https://www.michi-no-eki.jp/stations/views/19150',
        lat: 35.1856,
        lng: 138.9962,
        mapcode: '57 168 449',
        ...overrides,
    };
}

describe('toFeature', () => {
    it('should put the coordinates in GeoJSON order', () => {
        const feature = toFeature(station({ lat: 35.1856, lng: 138.9962 }));

        expect(feature.geometry.coordinates).toEqual([138.9962, 35.1856]);
    });

    it('should carry every station field into the properties', () => {
        const feature = toFeature(station());

        expect(feature.properties).toEqual({
            prefId: '23',
            prefName: '神奈川県',
            stationId: '19150',
            name: '箱根峠',
            address: '250-0521 神奈川県足柄下郡箱根町箱根381-22',
            tel: '0460-83-7310',
            hours: '9:00〜17:00',
            uri: 'https://www.michi-no-eki.jp/stations/views/19150',
            mapcode: '57 168 449',
        });
    });

    it('should fall back to a fixed point when a coordinate is missing', () => {
        expect(toFeature(station({ lat: null, lng: null })).geometry.coordinates).toEqual(FALLBACK_COORDINATES);
        expect(toFeature(station({ lat: null })).geometry.coordinates).toEqual(FALLBACK_COORDINATES);
        expect(toFeature(station({ lng: null })).geometry.coordinates).toEqual(FALLBACK_COORDINATES);
    });
});

describe('serialize', () => {
    it('should order features by numeric stationId', () => {
        const parsed = JSON.parse(
            serialize([station({ stationId: '100' }), station({ stationId: '9' }), station({ stationId: '20' })])
        );

        expect(parsed.features.map((f: { properties: { stationId: string } }) => f.properties.stationId)).toEqual([
            '9',
            '20',
            '100',
        ]);
    });

    it('should not reorder the array it was given', () => {
        const stations = [station({ stationId: '2' }), station({ stationId: '1' })];

        serialize(stations);

        expect(stations.map((s) => s.stationId)).toEqual(['2', '1']);
    });

    it('should write one feature per line so grep matches a whole station', () => {
        const lines = serialize([station({ stationId: '1' }), station({ stationId: '2' })])
            .trimEnd()
            .split('\n');

        // Opening line, one line per feature, closing line.
        expect(lines).toHaveLength(4);
        expect(JSON.parse(lines[1].replace(/,$/, '')).properties.stationId).toBe('1');
        expect(JSON.parse(lines[2].replace(/,$/, '')).properties.stationId).toBe('2');
    });

    it('should stay parsable with no stations at all', () => {
        expect(JSON.parse(serialize([])).features).toEqual([]);
    });
});
