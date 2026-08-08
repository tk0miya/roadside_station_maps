import { describe, expect, it } from 'vitest';
import { expectApiError } from '#test-utils/gas';
import { buildCellUpdates, readTable } from './sheet-table';

const HEADER = ['name', 'pref', 'city', 'status', 'date', 'lat', 'lng', 'memo'];

describe('readTable', () => {
    it('reads rows with their 1-based sheet row number', () => {
        const { rows } = readTable([
            HEADER,
            ['道の駅 A', '福井県', 'あわら市', '開業', '2023-04-22', '36.28', '136.25', 'https://a'],
        ]);

        expect(rows).toEqual([
            {
                rowNumber: 2,
                entry: {
                    name: '道の駅 A',
                    pref: '福井県',
                    city: 'あわら市',
                    status: '開業',
                    date: '2023-04-22',
                    lat: 36.28,
                    lng: 136.25,
                    memo: 'https://a',
                },
            },
        ]);
    });

    it('reads blank coordinates as null', () => {
        const { rows } = readTable([HEADER, ['道の駅 B', '長野県', '松本市', '計画中', '', '', '', '']]);
        expect(rows[0].entry.lat).toBeNull();
        expect(rows[0].entry.lng).toBeNull();
    });

    it('defaults an unknown status to 計画中', () => {
        const { rows } = readTable([HEADER, ['道の駅 C', '', '', '???', '', '', '', '']]);
        expect(rows[0].entry.status).toBe('計画中');
    });

    it('skips nameless rows but keeps the row numbers of the rest', () => {
        const { rows } = readTable([
            HEADER,
            ['', '', '', '', '', '', '', ''],
            ['道の駅 D', '', '', '計画中', '', '', '', ''],
        ]);

        expect(rows).toHaveLength(1);
        expect(rows[0].rowNumber).toBe(3);
    });

    it('matches columns by header text, not position', () => {
        const { rows, columns } = readTable([
            ['memo', 'name', 'lng', 'lat', 'date', 'status', 'city', 'pref'],
            ['note', '道の駅 E', '136', '36', '2027', '登録済み', '松本市', '長野県'],
        ]);

        expect(columns.name).toBe(1);
        expect(rows[0].entry).toMatchObject({ name: '道の駅 E', lat: 36, lng: 136, status: '登録済み' });
    });

    // An unmanaged column sitting between managed ones shifts every index after
    // it, so this also pins the header-driven lookup.
    it('reads past columns the API does not manage', () => {
        const { rows } = readTable([
            ['name', 'pref', 'owner', 'city', 'status', 'date', 'lat', 'lng', 'memo'],
            ['道の駅 F', '長野県', 'someone', '松本市', '計画中', '2027', '36', '137', 'note'],
        ]);

        expect(rows[0].entry).toEqual({
            name: '道の駅 F',
            pref: '長野県',
            city: '松本市',
            status: '計画中',
            date: '2027',
            lat: 36,
            lng: 137,
            memo: 'note',
        });
    });

    it('rejects a sheet whose header is missing a managed column', () => {
        expectApiError(
            () =>
                readTable([
                    ['name', 'pref'],
                    ['道の駅 G', '長野県'],
                ]),
            'internal',
            /missing the column/
        );
    });

    it('rejects an empty sheet', () => {
        expectApiError(() => readTable([]), 'internal', /no header row/);
    });
});

describe('buildCellUpdates', () => {
    it('touches only the columns present in the patch', () => {
        const { columns } = readTable([HEADER]);

        expect(buildCellUpdates(columns, { status: '開業', date: '2027-04-01' })).toEqual([
            { columnNumber: 4, value: '開業' },
            { columnNumber: 5, value: '2027-04-01' },
        ]);
    });

    it('clears a coordinate that the patch sets to null', () => {
        const { columns } = readTable([HEADER]);
        expect(buildCellUpdates(columns, { lat: null })).toEqual([{ columnNumber: 6, value: '' }]);
    });

    it('produces nothing for an empty patch', () => {
        const { columns } = readTable([HEADER]);
        expect(buildCellUpdates(columns, {})).toEqual([]);
    });
});
