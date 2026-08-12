// Tests for the CLI's argument reading. What the arguments then do to the master
// is src/lib/plan-master.test.ts; these check that a mistyped or missing argument
// is refused rather than quietly dropped -- a dropped --title would write a
// source the map cannot label, and a dropped --status would report success while
// changing nothing.

import { describe, expect, it } from 'vitest';
import type { PlanRecord } from '../frontend/types/plan';
import { buildKey, buildListOptions, buildUpdates, checkArgs, parseArgs, URL_ACTIONS } from './plan';

const KEY_USAGE = 'npm run plan -- update "<name>" <prefecture>';

function check(args: string[]): void {
    checkArgs(parseArgs(args));
}

function plan(urls: PlanRecord['urls']): PlanRecord {
    return {
        name: '道の駅あ',
        pref: '福井県',
        city: '◯◯町',
        status: '計画中',
        date: '',
        lat: null,
        lng: null,
        urls,
        checked_on: '2026-01-01',
    };
}

describe('parseArgs', () => {
    it('takes the command from the first positional', () => {
        expect(parseArgs(['list'])).toEqual({ command: 'list', positionals: [], flags: {} });
    });

    it('accepts --flag=value', () => {
        const parsed = parseArgs(['update', '道の駅あ', '福井県', '--status=開業', '--date=2026-04-01']);

        expect(parsed.command).toBe('update');
        expect(parsed.positionals).toEqual(['道の駅あ', '福井県']);
        expect(parsed.flags).toEqual({ status: '開業', date: '2026-04-01' });
    });

    it('accepts --flag value', () => {
        const parsed = parseArgs(['update', '道の駅あ', '--status', '開業', '--date', '2026-04-01']);

        expect(parsed.flags).toEqual({ status: '開業', date: '2026-04-01' });
    });

    it('keeps an empty value, which clears a column', () => {
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
        expect(buildKey(['道の駅 川崎町', '福岡県'], KEY_USAGE)).toEqual({ name: '道の駅 川崎町', pref: '福岡県' });
    });

    it('trims both halves, keeping stray spaces out of the messages built from them', () => {
        expect(buildKey([' 道の駅あ ', ' 福井県 '], KEY_USAGE)).toEqual({ name: '道の駅あ', pref: '福井県' });
    });

    it.each([[[]], [['']], [['  ', '福井県']]])('rejects the positionals %j as a missing name', (positionals) => {
        expect(() => buildKey(positionals, KEY_USAGE)).toThrow('Missing plan name');
    });

    it.each([[['道の駅あ']], [['道の駅あ', '']], [['道の駅あ', '  ']]])(
        'rejects the positionals %j as a missing prefecture',
        (positionals) => {
            expect(() => buildKey(positionals, KEY_USAGE)).toThrow('Missing prefecture for 道の駅あ');
        }
    );

    // A name holding spaces arrives split when it was not quoted, so the error
    // shows the name put back together with quotes around it.
    it.each([
        [['道の駅', '川崎町', '福岡県'], '"道の駅 川崎町" 福岡県'],
        [['道の駅', 'スタープラザ', '芦別', '北海道'], '"道の駅 スタープラザ 芦別" 北海道'],
    ])('quotes %j back as %s', (positionals, quoted) => {
        expect(() => buildKey(positionals, KEY_USAGE)).toThrow(`Quote the name: ${quoted}`);
    });

    // Reported as a problem with the prefecture rather than as a quoting slip,
    // because the fix suggested for a quoting slip would fail in turn -- requoting
    // a name whose last word is not a prefecture fails again. This holds the two
    // guards in that order: swapping them would send the second case to
    // "Quote the name", whose suggestion does not work.
    it.each([[['道の駅あ', '川崎']], [['道の駅', 'スタープラザ', '芦別']]])(
        'rejects the positionals %j as a missing prefecture rather than a quoting slip',
        (positionals) => {
            expect(() => buildKey(positionals, KEY_USAGE)).toThrow('Invalid prefecture');
        }
    );
});

describe('buildUpdates', () => {
    it('includes only the flags that were given', () => {
        expect(buildUpdates({ status: '登録済み' })).toEqual({ status: '登録済み' });
    });

    it('trims text columns', () => {
        expect(buildUpdates({ name: ' 道の駅あ ', date: ' 2026-04 ' })).toEqual({
            name: '道の駅あ',
            date: '2026-04',
        });
    });

    it('keeps an empty value, which clears the column', () => {
        expect(buildUpdates({ date: '' })).toEqual({ date: '' });
    });

    it('reads coordinates as numbers', () => {
        expect(buildUpdates({ lat: '43.77', lng: '-142.36' })).toEqual({ lat: 43.77, lng: -142.36 });
    });

    it('reads an empty coordinate as null, which clears it', () => {
        expect(buildUpdates({ lat: '', lng: '  ' })).toEqual({ lat: null, lng: null });
    });

    it('rejects a coordinate that is not a number', () => {
        expect(() => buildUpdates({ lat: '北緯 43 度' })).toThrow('Invalid --lat');
    });
});

describe('buildListOptions', () => {
    it('splits --status on commas and trims each value', () => {
        expect(buildListOptions({ status: '登録済み, 計画中 ,凍結' })).toEqual({
            statuses: ['登録済み', '計画中', '凍結'],
        });
    });

    it('accepts --sort=checked_on', () => {
        expect(buildListOptions({ sort: 'checked_on' })).toEqual({ sort: 'checked_on' });
    });

    it('rejects any other --sort', () => {
        expect(() => buildListOptions({ sort: 'date' })).toThrow('Invalid --sort: date');
    });

    it('reads --limit as a count', () => {
        expect(buildListOptions({ limit: '10' })).toEqual({ limit: 10 });
    });

    // The empty value is the interesting one: Number('') is 0, so without a check
    // `--limit=` would print an empty list, which reads as a queue with nothing
    // left in it.
    it.each(['-1', '1.5', 'ten', '', '  '])('rejects --limit=%p', (limit) => {
        expect(() => buildListOptions({ limit })).toThrow('Invalid --limit');
    });
});

describe('checkArgs', () => {
    it('accepts each command in the shape it declares', () => {
        expect(() => check(['list', '--status=計画中', '--sort=checked_on', '--limit=10'])).not.toThrow();
        expect(() => check(['show', '道の駅 川崎町', '福岡県'])).not.toThrow();
        expect(() => check(['update', '道の駅 川崎町', '福岡県'])).not.toThrow();
        expect(() => check(['update', '道の駅 川崎町', '福岡県', '--status=開業'])).not.toThrow();
        expect(() => check(['url', 'remove', '道の駅 川崎町', '福岡県', '--dead=https://example.jp/a'])).not.toThrow();
        expect(() =>
            check([
                'add',
                '--name=あ',
                '--pref=福井県',
                '--city=◯◯町',
                '--status=計画中',
                '--url=https://e.jp',
                '--title=あ',
            ])
        ).not.toThrow();
    });

    it('rejects an unknown command', () => {
        expect(() => check(['delete', '道の駅あ', '福井県'])).toThrow('Unknown command: delete');
    });

    // A misspelled flag is the failure this catches: without the check it would
    // be dropped, and the command would report success having written nothing.
    it('rejects a flag the command does not declare', () => {
        expect(() => check(['update', '道の駅あ', '福井県', '--statis=開業'])).toThrow('Unknown option: --statis');
    });

    it('rejects a field flag on a reading command', () => {
        expect(() => check(['show', '道の駅あ', '福井県', '--status=開業'])).toThrow('Unknown option: --status');
        expect(() => check(['list', '--date=2026'])).toThrow('Unknown option: --date');
    });

    it('rejects a missing required flag', () => {
        expect(() => check(['add', '--name=あ', '--pref=福井県'])).toThrow('Missing --city');
        expect(() => check(['url', 'remove', '道の駅あ', '福井県'])).toThrow('Missing --dead');
        expect(() => check(['url', 'add', '道の駅あ', '福井県', '--url=https://e.jp'])).toThrow('Missing --title');
    });

    // Each url action takes its own flags, so one that belongs to a sibling
    // action is as wrong as one that belongs to no action at all.
    it('rejects a flag belonging to a different url action', () => {
        expect(() => check(['url', 'remove', '道の駅あ', '福井県', '--dead=https://e.jp', '--title=あ'])).toThrow(
            'Unknown option: --title'
        );
    });

    it('rejects an unknown url action', () => {
        expect(() => check(['url', 'swap', '道の駅あ', '福井県', '--dead=https://e.jp'])).toThrow(
            'Unknown url action: swap'
        );
    });

    it('rejects positionals on a command that takes none', () => {
        expect(() => check(['list', '道の駅あ'])).toThrow('list takes no arguments');
        expect(() => check(['add', '道の駅あ'])).toThrow('add takes no arguments');
    });

    it('rejects url with no action', () => {
        expect(() => check(['url'])).toThrow('Missing action');
    });
});

// Which flag feeds which argument. Getting this wrong is the one mistake the rest
// of the tests cannot see: the source operations are covered on their own, and the
// argument checks above only look at whether a flag is present, so a --dead read
// as the incoming url would drop the live source and keep the dead one with
// everything still green.
describe('URL_ACTIONS', () => {
    const dead = { title: '消えた記事', url: 'https://example.jp/dead' };
    const alive = { title: '生きている記事', url: 'https://example.jp/alive' };

    it('adds the source named by --url and --title', () => {
        const entry = plan([alive]);

        URL_ACTIONS.add.run(entry, { url: 'https://example.jp/new', title: '新しい出典' });

        expect(entry.urls).toEqual([alive, { title: '新しい出典', url: 'https://example.jp/new' }]);
    });

    it('replaces the source named by --dead with the one named by --url', () => {
        const entry = plan([dead, alive]);

        URL_ACTIONS.replace.run(entry, {
            dead: dead.url,
            url: 'https://example.jp/successor',
            title: '後継記事',
        });

        expect(entry.urls).toEqual([{ title: '後継記事', url: 'https://example.jp/successor' }, alive]);
    });

    it('removes the source named by --dead', () => {
        const entry = plan([dead, alive]);

        URL_ACTIONS.remove.run(entry, { dead: dead.url });

        expect(entry.urls).toEqual([alive]);
    });

    it('retitles the source named by --url, leaving its url alone', () => {
        const entry = plan([dead, alive]);

        URL_ACTIONS.title.run(entry, { url: alive.url, title: '本当の見出し' });

        expect(entry.urls).toEqual([dead, { title: '本当の見出し', url: alive.url }]);
    });

    // A url pasted from a terminal can arrive with a trailing space, and a url is
    // matched exactly -- so trimming has to happen before the match, not after.
    it('trims the urls and titles it is given', () => {
        const entry = plan([dead, alive]);

        URL_ACTIONS.replace.run(entry, {
            dead: ` ${dead.url} `,
            url: ' https://example.jp/successor ',
            title: ' 後継記事 ',
        });

        expect(entry.urls).toEqual([{ title: '後継記事', url: 'https://example.jp/successor' }, alive]);
    });
});
