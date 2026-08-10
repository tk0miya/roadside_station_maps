import { describe, expect, it } from 'vitest';
import { parseMemo, parseMemoLine } from './plan-memo';

describe('parseMemoLine', () => {
    it('keeps plain text as a single segment', () => {
        expect(parseMemoLine('着工は未定')).toEqual([{ type: 'text', text: '着工は未定' }]);
    });

    it('returns no segments for an empty line', () => {
        expect(parseMemoLine('')).toEqual([]);
    });

    it('links a markdown link with its title as the label', () => {
        expect(parseMemoLine('[整備計画](https://example.com/plan)')).toEqual([
            { type: 'link', text: '整備計画', href: 'https://example.com/plan' },
        ]);
    });

    it('keeps the text around a markdown link', () => {
        expect(parseMemoLine('詳細は [整備計画](https://example.com/plan) を参照')).toEqual([
            { type: 'text', text: '詳細は ' },
            { type: 'link', text: '整備計画', href: 'https://example.com/plan' },
            { type: 'text', text: ' を参照' },
        ]);
    });

    it('links several markdown links on one line', () => {
        expect(parseMemoLine('[A](https://example.com/a)、[B](https://example.com/b)')).toEqual([
            { type: 'link', text: 'A', href: 'https://example.com/a' },
            { type: 'text', text: '、' },
            { type: 'link', text: 'B', href: 'https://example.com/b' },
        ]);
    });

    it('falls back to the URL when the markdown title is blank', () => {
        expect(parseMemoLine('[ ](https://example.com/plan)')).toEqual([
            { type: 'link', text: 'https://example.com/plan', href: 'https://example.com/plan' },
        ]);
    });

    it('links a bare URL with the URL as its label', () => {
        expect(parseMemoLine('https://example.com/plan')).toEqual([
            { type: 'link', text: 'https://example.com/plan', href: 'https://example.com/plan' },
        ]);
    });

    it('links a bare URL embedded in text', () => {
        expect(parseMemoLine('出典 https://example.com/plan より')).toEqual([
            { type: 'text', text: '出典 ' },
            { type: 'link', text: 'https://example.com/plan', href: 'https://example.com/plan' },
            { type: 'text', text: ' より' },
        ]);
    });

    it('excludes trailing ASCII punctuation from a bare URL', () => {
        expect(parseMemoLine('資料は https://example.com/plan.')).toEqual([
            { type: 'text', text: '資料は ' },
            { type: 'link', text: 'https://example.com/plan', href: 'https://example.com/plan' },
            { type: 'text', text: '.' },
        ]);
    });

    it('stops a bare URL at a Japanese period', () => {
        expect(parseMemoLine('資料は https://example.com/plan。')).toEqual([
            { type: 'text', text: '資料は ' },
            { type: 'link', text: 'https://example.com/plan', href: 'https://example.com/plan' },
            { type: 'text', text: '。' },
        ]);
    });

    it('does not link a markdown link with a non-http target', () => {
        expect(parseMemoLine('[クリック](mailto:someone@example.com)')).toEqual([
            { type: 'text', text: '[クリック](mailto:someone@example.com)' },
        ]);
    });

    it('does not link a markdown link with a javascript target', () => {
        expect(parseMemoLine('[クリック](javascript:alert(1))')).toEqual([
            { type: 'text', text: '[クリック](javascript:alert(1))' },
        ]);
    });

    it('links a bare http URL', () => {
        expect(parseMemoLine('http://example.com/plan')).toEqual([
            { type: 'link', text: 'http://example.com/plan', href: 'http://example.com/plan' },
        ]);
    });

    it('links an uppercase scheme', () => {
        expect(parseMemoLine('HTTPS://EXAMPLE.COM/plan')).toEqual([
            { type: 'link', text: 'HTTPS://EXAMPLE.COM/plan', href: 'HTTPS://EXAMPLE.COM/plan' },
        ]);
    });

    it('links several bare URLs on one line', () => {
        expect(parseMemoLine('https://example.com/a と https://example.com/b')).toEqual([
            { type: 'link', text: 'https://example.com/a', href: 'https://example.com/a' },
            { type: 'text', text: ' と ' },
            { type: 'link', text: 'https://example.com/b', href: 'https://example.com/b' },
        ]);
    });

    it('keeps parentheses that belong to a markdown link target', () => {
        expect(parseMemoLine('[道の駅](https://example.com/wiki/道の駅_(曖昧さ回避))')).toEqual([
            { type: 'link', text: '道の駅', href: 'https://example.com/wiki/道の駅_(曖昧さ回避)' },
        ]);
    });

    it('keeps parentheses that belong to a bare URL', () => {
        expect(parseMemoLine('https://example.com/wiki/道の駅_(曖昧さ回避)')).toEqual([
            {
                type: 'link',
                text: 'https://example.com/wiki/道の駅_(曖昧さ回避)',
                href: 'https://example.com/wiki/道の駅_(曖昧さ回避)',
            },
        ]);
    });

    it('stops a bare URL at Japanese punctuation without a space', () => {
        expect(parseMemoLine('https://example.com/plan。詳細は後日')).toEqual([
            { type: 'link', text: 'https://example.com/plan', href: 'https://example.com/plan' },
            { type: 'text', text: '。詳細は後日' },
        ]);
    });

    it('splits bare URLs separated by a Japanese comma', () => {
        expect(parseMemoLine('https://example.com/a、https://example.com/b')).toEqual([
            { type: 'link', text: 'https://example.com/a', href: 'https://example.com/a' },
            { type: 'text', text: '、' },
            { type: 'link', text: 'https://example.com/b', href: 'https://example.com/b' },
        ]);
    });

    it('excludes Japanese quotation marks around a bare URL', () => {
        expect(parseMemoLine('「https://example.com/plan」を参照')).toEqual([
            { type: 'text', text: '「' },
            { type: 'link', text: 'https://example.com/plan', href: 'https://example.com/plan' },
            { type: 'text', text: '」を参照' },
        ]);
    });

    it('excludes brackets around a bare URL', () => {
        expect(parseMemoLine('【https://example.com/plan】')).toEqual([
            { type: 'text', text: '【' },
            { type: 'link', text: 'https://example.com/plan', href: 'https://example.com/plan' },
            { type: 'text', text: '】' },
        ]);
        expect(parseMemoLine('［https://example.com/plan］を参照')).toEqual([
            { type: 'text', text: '［' },
            { type: 'link', text: 'https://example.com/plan', href: 'https://example.com/plan' },
            { type: 'text', text: '］を参照' },
        ]);
        expect(parseMemoLine('[https://example.com/plan]')).toEqual([
            { type: 'text', text: '[' },
            { type: 'link', text: 'https://example.com/plan', href: 'https://example.com/plan' },
            { type: 'text', text: ']' },
        ]);
    });

    it('merges the text around a target that is not linked', () => {
        expect(parseMemoLine('[問い合わせ](mailto:someone@example.com) まで')).toEqual([
            { type: 'text', text: '[問い合わせ](mailto:someone@example.com) まで' },
        ]);
    });

    it('excludes an unmatched ASCII closing parenthesis from a bare URL', () => {
        expect(parseMemoLine('(出典 https://example.com/plan)')).toEqual([
            { type: 'text', text: '(出典 ' },
            { type: 'link', text: 'https://example.com/plan', href: 'https://example.com/plan' },
            { type: 'text', text: ')' },
        ]);
    });

    it('excludes Japanese parentheses around a bare URL', () => {
        expect(parseMemoLine('（出典 https://example.com/plan）')).toEqual([
            { type: 'text', text: '（出典 ' },
            { type: 'link', text: 'https://example.com/plan', href: 'https://example.com/plan' },
            { type: 'text', text: '）' },
        ]);
    });
});

describe('parseMemo', () => {
    it('parses each line separately and keeps blank lines', () => {
        expect(parseMemo('着工は未定\n\n[整備計画](https://example.com/plan)')).toEqual([
            [{ type: 'text', text: '着工は未定' }],
            [],
            [{ type: 'link', text: '整備計画', href: 'https://example.com/plan' }],
        ]);
    });

    it('trims each line', () => {
        expect(parseMemo('  着工は未定  ')).toEqual([[{ type: 'text', text: '着工は未定' }]]);
    });

    it('reduces a whitespace-only line to no segments', () => {
        expect(parseMemo('   ')).toEqual([[]]);
    });
});
