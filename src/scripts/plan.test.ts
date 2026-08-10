import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlanEntry } from '../lib/plan-api';
import { buildKey, buildUpdate, buildValues, parseArgs, rejectFlags, selectEntry } from './plan';

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
        expect(buildKey(['道の駅 川崎町', '福岡県'], 'update')).toEqual({ name: '道の駅 川崎町', pref: '福岡県' });
    });

    it('trims both halves, keeping stray spaces out of the messages built from them', () => {
        expect(buildKey([' 道の駅あ ', ' 福井県 '], 'update')).toEqual({ name: '道の駅あ', pref: '福井県' });
    });

    it.each([[[]], [['']], [['  ', '福井県']]])('rejects the positionals %j as a missing name', (positionals) => {
        expect(() => buildKey(positionals, 'update')).toThrow('Missing entry name');
    });

    it.each([[['道の駅あ']], [['道の駅あ', '']], [['道の駅あ', '  ']]])(
        'rejects the positionals %j as a missing prefecture',
        (positionals) => {
            expect(() => buildKey(positionals, 'update')).toThrow('Missing prefecture for 道の駅あ');
        }
    );

    it.each([
        [['道の駅', '川崎町', '福岡県'], '"道の駅 川崎町" 福岡県'],
        [['道の駅', 'スタープラザ', '芦別', '北海道'], '"道の駅 スタープラザ 芦別" 北海道'],
    ])('quotes %j back as %s, the name an unquoted argument list split apart', (positionals, quoted) => {
        expect(() => buildKey(positionals, 'update')).toThrow(`Unexpected extra arguments. Quote the name: ${quoted}`);
    });

    it.each([
        [['道の駅', '川崎町'], '川崎町'],
        [['道の駅', 'スタープラザ', '芦別'], '芦別'],
    ])('reports %j as the invalid prefecture %s, an unquoted name given no prefecture at all', (positionals, pref) => {
        expect(() => buildKey(positionals, 'update')).toThrow(`Invalid prefecture: ${pref}`);
    });

    it.each(['東京都', '北海道', '京都府'])('accepts the %s suffix as well as 県', (pref) => {
        expect(buildKey(['道の駅あ', pref], 'update').pref).toBe(pref);
    });

    it.each([
        ['show', 'npm run --silent plan:show'],
        ['update', 'npm run plan:update'],
    ] as const)('points %s at its own usage line', (command, usage) => {
        expect(() => buildKey([], command)).toThrow(usage);
    });
});

describe('rejectFlags', () => {
    it('accepts a command given no options', () => {
        expect(() => rejectFlags('list', {})).not.toThrow();
    });

    it('names the offending option and points at both jq and update, the two things it could have meant', () => {
        expect(() => rejectFlags('show', { status: '開業' })).toThrow(
            /Unknown option: --status\. show only reads .*jq.*plan:update/
        );
    });
});

describe('selectEntry', () => {
    const entries: PlanEntry[] = [
        { name: '道の駅 川崎町', pref: '福岡県', status: '計画中' },
        { name: '道の駅 川崎町', pref: '宮城県', status: '開業' },
        { name: '道の駅あ', pref: '福井県', status: '計画中' },
    ];

    it('matches on the name and the prefecture together', () => {
        expect(selectEntry(entries, '道の駅 川崎町', '宮城県')).toEqual({
            name: '道の駅 川崎町',
            pref: '宮城県',
            status: '開業',
        });
    });

    it('rejects a name held by no entry of that prefecture', () => {
        expect(() => selectEntry(entries, '道の駅あ', '宮城県')).toThrow('No entry named 道の駅あ in 宮城県');
    });

    it('reports a duplicate with its count instead of picking one of the rows', () => {
        const duplicated = [...entries, { name: '道の駅あ', pref: '福井県', status: '中止' }];

        expect(() => selectEntry(duplicated, '道の駅あ', '福井県')).toThrow('2 entries named 道の駅あ in 福井県');
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

    // The day is buildUpdate's to write, and a caller-given one would order the
    // research queue by whatever it said.
    it('rejects checked_on, which no flag reaches', () => {
        expect(() => buildValues({ checked_on: '2026-08-10' })).toThrow('Unknown field: --checked_on');
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
});

describe('buildUpdate', () => {
    // Fixed at a moment where Japan and UTC disagree on the date, so the day the
    // stamp carries can only come out right if it is read in Japan's timezone.
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-10T23:00:00Z')); // 2026-08-11 08:00 JST
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('stamps checked_on with today in Japan, not with the day of the machine running it', () => {
        expect(buildUpdate({ status: '開業' })).toEqual({ status: '開業', checked_on: '2026-08-11' });
    });

    it('records a research pass that changed nothing when given no fields', () => {
        expect(buildUpdate({})).toEqual({ checked_on: '2026-08-11' });
    });
});
