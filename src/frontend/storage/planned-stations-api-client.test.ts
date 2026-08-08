import { describe, expect, it } from 'vitest';
import type { City } from '../types/plan';
import { parsePlannedStations } from './planned-stations-api-client';

const cities: City[] = [{ pref: '長野県', city: '上伊那郡箕輪町', lat: 35.9, lng: 137.9 }];

const HEADER = 'name,pref,city,status,date,lat,lng,memo\n';

describe('parsePlannedStations', () => {
    it('uses explicit coordinates (coordSource=exact)', () => {
        const csv = `${HEADER}道の駅 A,福井県,あわら市,開業,2023-04-22,36.28,136.25,https://a`;
        const [s] = parsePlannedStations(csv, cities);
        expect(s.status).toBe('開業');
        expect(s.date).toBe('2023-04-22');
        expect(s.lat).toBe(36.28);
        expect(s.lng).toBe(136.25);
        expect(s.coordSource).toBe('exact');
    });

    it('falls back to the city centroid when coordinates are missing (coordSource=city)', () => {
        const csv = `${HEADER}道の駅 B,長野県,上伊那郡箕輪町,計画中,,,,memo`;
        const [s] = parsePlannedStations(csv, cities);
        expect(s.coordSource).toBe('city');
        expect(s.lat).toBe(35.9);
        expect(s.lng).toBe(137.9);
    });

    it('yields coordSource=none when neither coordinates nor a known city are given', () => {
        const csv = `${HEADER}道の駅 C,未知県,未知市,計画中,,,,`;
        const [s] = parsePlannedStations(csv, cities);
        expect(s.coordSource).toBe('none');
        expect(s.lat).toBeNull();
        expect(s.lng).toBeNull();
    });

    it('defaults an unknown status to 計画中', () => {
        const csv = `${HEADER}道の駅 D,福井県,あわら市,???,,36,136,`;
        const [s] = parsePlannedStations(csv, cities);
        expect(s.status).toBe('計画中');
    });

    it('keeps a quoted multi-line memo as a single record', () => {
        const csv = `${HEADER}"道の駅 E",高知県,高岡郡佐川町,開業,2023-06-25,33.5,133.3,"https://a\nhttps://b"`;
        const rows = parsePlannedStations(csv, cities);
        expect(rows).toHaveLength(1);
        expect(rows[0].memo.split('\n')).toHaveLength(2);
    });

    it('skips rows without a name', () => {
        const csv = `${HEADER},福井県,あわら市,開業,,36,136,`;
        expect(parsePlannedStations(csv, cities)).toHaveLength(0);
    });
});
