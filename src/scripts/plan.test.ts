import { describe, expect, it } from 'vitest';
import { buildKey, buildValues, parseArgs } from './plan';

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

describe('buildKey', () => {
    it('takes the name and the prefecture from the two positionals', () => {
        expect(buildKey(['道の駅 川崎町', '福岡県'])).toEqual({ name: '道の駅 川崎町', pref: '福岡県' });
    });

    it('trims both halves, keeping stray spaces out of the messages built from them', () => {
        expect(buildKey([' 道の駅あ ', ' 福井県 '])).toEqual({ name: '道の駅あ', pref: '福井県' });
    });

    it.each([[[]], [['']], [['  ', '福井県']]])('rejects the positionals %j as a missing name', (positionals) => {
        expect(() => buildKey(positionals)).toThrow('Missing entry name');
    });

    it.each([[['道の駅あ']], [['道の駅あ', '']], [['道の駅あ', '  ']]])(
        'rejects the positionals %j as a missing prefecture',
        (positionals) => {
            expect(() => buildKey(positionals)).toThrow('Missing prefecture for 道の駅あ');
        }
    );

    it.each([
        [['道の駅', '川崎町', '福岡県'], '"道の駅 川崎町" 福岡県'],
        [['道の駅', 'スタープラザ', '芦別', '北海道'], '"道の駅 スタープラザ 芦別" 北海道'],
    ])('quotes %j back as %s, the name an unquoted argument list split apart', (positionals, quoted) => {
        expect(() => buildKey(positionals)).toThrow(`Unexpected extra arguments. Quote the name: ${quoted}`);
    });

    it.each([
        [['道の駅', '川崎町'], '川崎町'],
        [['道の駅', 'スタープラザ', '芦別'], '芦別'],
    ])('reports %j as the invalid prefecture %s, an unquoted name given no prefecture at all', (positionals, pref) => {
        expect(() => buildKey(positionals)).toThrow(`Invalid prefecture: ${pref}`);
    });

    it.each(['東京都', '北海道', '京都府'])('accepts the %s suffix as well as 県', (pref) => {
        expect(buildKey(['道の駅あ', pref]).pref).toBe(pref);
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

    it.each([
        ['pref', '福井県'],
        ['city', '福井市'],
    ])('rejects %s, which is not a column describing progress', (field, value) => {
        expect(() => buildValues({ [field]: value })).toThrow(`Unknown field: --${field}`);
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
