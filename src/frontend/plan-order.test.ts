import { describe, expect, it } from 'vitest';
import { sortPlannedStations } from './plan-order';
import type { City, PlannedStation } from './types/plan';

// Prefectures in 全国地方公共団体コード order, as data/cities.json supplies them.
const cities: City[] = [
    { code: '011002', pref: '北海道', city: '札幌市', lat: 43, lng: 141 },
    { code: '075019', pref: '福島県', city: '石川郡石川町', lat: 37, lng: 140 },
    { code: '203831', pref: '長野県', city: '上伊那郡箕輪町', lat: 35.9, lng: 137.9 },
    { code: '406058', pref: '福岡県', city: '田川郡川崎町', lat: 33.6, lng: 130.8 },
];

function station(overrides: Partial<PlannedStation>): PlannedStation {
    return {
        name: '道の駅 X',
        pref: '長野県',
        city: '上伊那郡箕輪町',
        status: '計画中',
        date: '',
        lat: null,
        lng: null,
        urls: [],
        coordSource: 'none',
        ...overrides,
    };
}

// Sort by date alone: every station shares a category, so only the date differs.
function datesInOrder(dates: string[]): string[] {
    const stations = dates.map((date) => station({ status: '開業', date }));
    return sortPlannedStations(stations, cities).map((s) => s.date);
}

describe('sortPlannedStations', () => {
    it('orders dated stations by their opening date', () => {
        expect(datesInOrder(['2027-04-01', '2026-09-18', '2026-03-15'])).toEqual([
            '2026-03-15',
            '2026-09-18',
            '2027-04-01',
        ]);
    });

    it('places a coarse notation at the last point it can mean', () => {
        expect(
            datesInOrder([
                '2027-05-01',
                '2026年度末',
                '2026冬',
                '2026年度下半期',
                '2026夏ごろ',
                '2026-04-10',
                '2026年度上半期',
                '2026年度初頭',
                '2026年度',
                '2026',
            ])
        ).toEqual([
            '2026-04-10',
            '2026年度初頭', // by June
            '2026夏ごろ', // by August
            '2026年度上半期', // by September
            '2026', // by December
            '2026冬', // by February 2027
            '2026年度末', // by March 2027
            '2026年度下半期', // by March 2027, over a wider span
            '2026年度', // by March 2027, over the widest
            '2027-05-01',
        ]);
    });

    it('puts the more precise value first when two notations end together', () => {
        expect(datesInOrder(['2026', '2026-12', '2026-12-31'])).toEqual(['2026-12-31', '2026-12', '2026']);
    });

    it('places a 年度 at the end of that fiscal year, not at its start', () => {
        expect(datesInOrder(['2027-04-01', '2026年度', '2027-03-31', '2026-04-01'])).toEqual([
            '2026-04-01',
            '2027-03-31',
            '2026年度',
            '2027-04-01',
        ]);
    });

    it('falls back to the end of the leading year for a notation it does not recognise', () => {
        expect(datesInOrder(['2027-06-01', '2026年前半', '2026-07-01'])).toEqual([
            '2026-07-01',
            '2026年前半',
            '2027-06-01',
        ]);
    });

    it('sorts a station naming no year at all to the end of its category', () => {
        expect(datesInOrder(['', '未定', '2030-01-01'])).toEqual(['2030-01-01', '', '未定']);
    });

    it('orders 計画中(未定) by prefecture code', () => {
        const stations = [
            station({ pref: '福岡県', city: '田川郡川崎町' }),
            station({ pref: '北海道', city: '札幌市中央区' }),
            station({ pref: '福島県', city: '石川郡石川町' }),
        ];
        expect(sortPlannedStations(stations, cities).map((s) => s.pref)).toEqual(['北海道', '福島県', '福岡県']);
    });

    it('sorts an unknown prefecture after every known one', () => {
        const stations = [
            station({ pref: '未知県', city: '未知市' }),
            station({ pref: '福岡県', city: '田川郡川崎町' }),
        ];
        expect(sortPlannedStations(stations, cities).map((s) => s.pref)).toEqual(['福岡県', '未知県']);
    });

    it('orders 中止 by prefecture as well, since its date will not happen', () => {
        const stations = [
            station({ status: '中止', pref: '福岡県', city: '田川郡川崎町', date: '2020-04-01' }),
            station({ status: '中止', pref: '北海道', city: '札幌市中央区', date: '2024-04-01' }),
        ];
        expect(sortPlannedStations(stations, cities).map((s) => s.pref)).toEqual(['北海道', '福岡県']);
    });

    it('orders 凍結 by prefecture, since its date is not being worked towards', () => {
        const stations = [
            station({ status: '凍結', pref: '福岡県', city: '田川郡川崎町', date: '2020-04-01' }),
            station({ status: '凍結', pref: '北海道', city: '札幌市中央区', date: '2024-04-01' }),
        ];
        expect(sortPlannedStations(stations, cities).map((s) => s.pref)).toEqual(['北海道', '福岡県']);
    });

    it('groups the list by category, in sidebar order', () => {
        const stations = [
            station({ name: '中止', status: '中止' }),
            station({ name: '凍結', status: '凍結' }),
            station({ name: '未定', status: '計画中' }),
            station({ name: '予定あり', status: '計画中', date: '2027' }),
            station({ name: '登録済み', status: '登録済み', date: '2026-10-01' }),
            station({ name: '開業', status: '開業', date: '2025-04-01' }),
        ];
        expect(sortPlannedStations(stations, cities).map((s) => s.name)).toEqual([
            '開業',
            '登録済み',
            '予定あり',
            '未定',
            '凍結',
            '中止',
        ]);
    });

    it('breaks a tie by prefecture, then city, then name', () => {
        const open = { status: '開業', date: '2026-04-01' } as const;
        const stations = [
            station({ ...open, name: '道の駅 B', pref: '福岡県', city: '田川郡川崎町' }),
            station({ ...open, name: '道の駅 A', pref: '福岡県', city: '田川郡川崎町' }),
            station({ ...open, name: '道の駅 D', pref: '福岡県', city: '北九州市' }),
            station({ ...open, name: '道の駅 C', pref: '北海道', city: '札幌市中央区' }),
        ];
        // 田川郡川崎町 precedes 北九州市 in Japanese collation order.
        expect(sortPlannedStations(stations, cities).map((s) => s.name)).toEqual([
            '道の駅 C',
            '道の駅 A',
            '道の駅 B',
            '道の駅 D',
        ]);
    });

    it('leaves the input array untouched', () => {
        const stations = [
            station({ status: '開業', date: '2027-01-01' }),
            station({ status: '開業', date: '2026-01-01' }),
        ];
        sortPlannedStations(stations, cities);
        expect(stations.map((s) => s.date)).toEqual(['2027-01-01', '2026-01-01']);
    });
});
