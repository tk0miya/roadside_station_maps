// Parser for the memo column of the development-plan sheet. A memo line mixes
// plain text with links written either as `[title](https://example.com)`, which
// renders with the title as its label (falling back to the URL when the title is
// blank), or as a bare `https://example.com`, which renders with the URL itself.

export type MemoSegment = { type: 'text'; text: string } | { type: 'link'; text: string; href: string };

// The markdown target allows one level of nested parentheses so that URLs like
// `.../道の駅_(曖昧さ回避)` keep their closing paren. A bare URL stops at the
// Japanese punctuation and brackets below, which a URL carries percent-encoded
// rather than literally; text following a URL with no delimiter at all is taken
// as part of it.
const LINK_PATTERN =
    /\[([^\]]*)\]\(([^()\s]*(?:\([^()\s]*\)[^()\s]*)*)\)|(https?:\/\/[^\s、。，．・「」『』（）【】［］\]]+)/gi;

// Punctuation that ends a sentence rather than a URL. Closing parens are judged
// separately: one that closes a paren inside the URL belongs to it.
const TRAILING_PUNCTUATION = /[.,;:!?]/;

function isHttpUrl(href: string): boolean {
    return /^https?:\/\//i.test(href);
}

function countOf(text: string, pattern: RegExp): number {
    return text.match(pattern)?.length ?? 0;
}

// Drop the sentence punctuation a bare URL picked up from the text around it.
function trimBareUrl(url: string): string {
    let result = url;
    while (result !== '') {
        const last = result[result.length - 1];
        if (last === ')') {
            if (countOf(result, /\(/g) >= countOf(result, /\)/g)) {
                break;
            }
        } else if (!TRAILING_PUNCTUATION.test(last)) {
            break;
        }
        result = result.slice(0, -1);
    }
    return result;
}

function pushText(segments: MemoSegment[], text: string): void {
    if (text === '') {
        return;
    }
    const last = segments[segments.length - 1];
    if (last?.type === 'text') {
        last.text += text;
    } else {
        segments.push({ type: 'text', text });
    }
}

export function parseMemoLine(line: string): MemoSegment[] {
    const segments: MemoSegment[] = [];
    let index = 0;

    for (const match of line.matchAll(LINK_PATTERN)) {
        pushText(segments, line.slice(index, match.index));
        index = match.index + match[0].length;

        const [matched, title, markdownHref, bareUrl] = match;
        if (bareUrl !== undefined) {
            const href = trimBareUrl(bareUrl);
            segments.push({ type: 'link', text: href, href });
            pushText(segments, bareUrl.slice(href.length));
        } else if (isHttpUrl(markdownHref)) {
            segments.push({ type: 'link', text: title.trim() || markdownHref, href: markdownHref });
        } else {
            pushText(segments, matched);
        }
    }

    pushText(segments, line.slice(index));
    return segments;
}

export function parseMemo(memo: string): MemoSegment[][] {
    return memo.split('\n').map((line) => parseMemoLine(line.trim()));
}
