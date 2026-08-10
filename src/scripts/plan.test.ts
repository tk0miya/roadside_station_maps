import { describe, expect, it } from 'vitest';
import { buildValues, parseArgs } from './plan';

describe('parseArgs', () => {
    it('takes the command from the first positional', () => {
        expect(parseArgs(['list'])).toEqual({ command: 'list', positionals: [], flags: {} });
    });

    it('accepts --flag=value', () => {
        const parsed = parseArgs(['update', '道の駅あ', '--status=開業', '--date=2026-04-01']);

        expect(parsed.command).toBe('update');
        expect(parsed.positionals).toEqual(['道の駅あ']);
        expect(parsed.flags).toEqual({ status: '開業', date: '2026-04-01' });
    });

    it('accepts --flag value', () => {
        const parsed = parseArgs(['update', '道の駅あ', '--status', '開業', '--date', '2026-04-01']);

        expect(parsed.flags).toEqual({ status: '開業', date: '2026-04-01' });
    });

    it('keeps an empty value, which clears the cell', () => {
        expect(parseArgs(['update', '道の駅あ', '--date=']).flags).toEqual({ date: '' });
        expect(parseArgs(['update', '道の駅あ', '--date', '']).flags).toEqual({ date: '' });
    });

    it('rejects a flag whose value is missing', () => {
        expect(() => parseArgs(['update', '道の駅あ', '--status'])).toThrow('Missing value for --status');
        expect(() => parseArgs(['update', '道の駅あ', '--status', '--date=2026-04-01'])).toThrow(
            'Missing value for --status'
        );
    });
});

describe('buildValues', () => {
    it('passes through the updatable fields', () => {
        expect(buildValues({ status: '開業', date: '2026-04-01', memo: 'https://example.com' })).toEqual({
            status: '開業',
            date: '2026-04-01',
            memo: 'https://example.com',
        });
    });

    it('rejects an unknown field', () => {
        expect(() => buildValues({ nmae: '道の駅あ' })).toThrow('Unknown field: --nmae');
    });

    it('passes through a rename', () => {
        expect(buildValues({ name: '道の駅い' })).toEqual({ name: '道の駅い' });
    });

    it('trims every value, since no column of the sheet carries padding', () => {
        expect(buildValues({ name: ' 道の駅い ', status: ' 開業 ', lat: ' 36.1 ' })).toEqual({
            name: '道の駅い',
            status: '開業',
            lat: '36.1',
        });
    });

    it('rejects an empty name, which no entry could be found by', () => {
        expect(() => buildValues({ name: '' })).toThrow('Invalid --name');
        expect(() => buildValues({ name: '  ' })).toThrow('Invalid --name');
    });

    it.each(['pref', 'city'])('rejects %s, which places an entry rather than describing it', (field) => {
        expect(() => buildValues({ [field]: '福井県' })).toThrow(`Unknown field: --${field}`);
    });

    it("rejects a status outside the sheet's four values", () => {
        expect(() => buildValues({ status: '開業予定' })).toThrow('Invalid --status: 開業予定');
    });

    it.each(['2026-04-01', '2026-04', '2026', '2026夏', ''])(
        'passes the date %s through, since the sheet records whatever precision is known',
        (date) => {
            expect(buildValues({ date })).toEqual({ date });
        }
    );

    it('rejects a non-numeric lat/lng but allows clearing them', () => {
        expect(() => buildValues({ lat: 'north' })).toThrow('Invalid --lat: north');
        expect(() => buildValues({ lng: 'east' })).toThrow('Invalid --lng: east');
        expect(buildValues({ lat: '', lng: '' })).toEqual({ lat: '', lng: '' });
    });

    it('rejects an empty update, which the Apps Script would report as a success', () => {
        expect(() => buildValues({})).toThrow('No fields to update');
    });
});
