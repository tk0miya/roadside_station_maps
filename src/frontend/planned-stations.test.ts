import { describe, expect, it } from 'vitest';
import { toPlannedStations } from './planned-stations';
import type { City, PlanRecord } from './types/plan';

const cities: City[] = [{ code: '203831', pref: '長野県', city: '上伊那郡箕輪町', lat: 35.9, lng: 137.9 }];

function record(overrides: Partial<PlanRecord>): PlanRecord {
    return {
        name: '道の駅 A',
        pref: '福井県',
        city: 'あわら市',
        status: '計画中',
        date: '',
        lat: null,
        lng: null,
        urls: [],
        checked_on: '',
        ...overrides,
    };
}

// Ordering is plan-order.ts's job and is covered by plan-order.test.ts; these
// cases use a single record so the sort cannot reorder what they assert on.
describe('toPlannedStations', () => {
    it('uses explicit coordinates (coordSource=exact)', () => {
        const urls = [{ title: '整備計画', url: 'https://example.com/a' }];
        const [s] = toPlannedStations(
            [record({ status: '開業', date: '2023-04-22', lat: 36.28, lng: 136.25, urls })],
            cities
        );
        expect(s.status).toBe('開業');
        expect(s.date).toBe('2023-04-22');
        expect(s.lat).toBe(36.28);
        expect(s.lng).toBe(136.25);
        expect(s.coordSource).toBe('exact');
        expect(s.urls).toEqual(urls);
    });

    it('falls back to the city centroid when coordinates are missing (coordSource=city)', () => {
        const [s] = toPlannedStations([record({ name: '道の駅 B', pref: '長野県', city: '上伊那郡箕輪町' })], cities);
        expect(s.coordSource).toBe('city');
        expect(s.lat).toBe(35.9);
        expect(s.lng).toBe(137.9);
    });

    it('yields coordSource=none when neither coordinates nor a known city are given', () => {
        const [s] = toPlannedStations([record({ name: '道の駅 C', pref: '未知県', city: '未知市' })], cities);
        expect(s.coordSource).toBe('none');
        expect(s.lat).toBeNull();
        expect(s.lng).toBeNull();
    });

    it('defaults an unknown status to 計画中', () => {
        const [s] = toPlannedStations([record({ status: '???', lat: 36, lng: 136 })], cities);
        expect(s.status).toBe('計画中');
    });

    it('skips records without a name', () => {
        expect(toPlannedStations([record({ name: '' })], cities)).toHaveLength(0);
    });

    it('orders the result for display', () => {
        const stations = toPlannedStations(
            [
                record({ name: '道の駅 遅い', status: '計画中', date: '2028' }),
                record({ name: '道の駅 早い', status: '計画中', date: '2026-04-01' }),
            ],
            cities
        );
        expect(stations.map((s) => s.name)).toEqual(['道の駅 早い', '道の駅 遅い']);
    });
});
