// Hits the real ABR endpoints, the way `generate-stationlist.test.ts` hits
// michi-no-eki.jp: so that a moved file or a renamed column shows up here
// instead of when someone next regenerates the table.
//
// Deliberately shallow. What the rows mean is `cities-master.test.ts`, against
// fixtures; what this asks is only whether the source still looks like the
// source. Three downloads (the two files, with the master fetched twice so the
// tests stay independent), about 120 KB in total.
import { describe, expect, it } from 'vitest';
import { fetchCities, fetchPositions } from './abr';

// ABR's CDN blocks requests from outside Japan (see src/lib/abr.ts), which rules
// out a GitHub-hosted runner; Claude Code's web sandbox has no route to the
// hosts either. Both leave the same gap: the source is only checked where it is
// reachable.
const offshore = process.env.CI === 'true' || process.env.CLAUDE_CODE_REMOTE === 'true';

describe.skipIf(offshore)('abr', () => {
    it('serves the municipality master with the columns the build reads', async () => {
        const rows = await fetchCities();

        // Japan has around 1,741 municipalities, plus the wards of the 20
        // designated cities. A much shorter file is a truncated download.
        expect(rows.length).toBeGreaterThan(1700);

        const chiyoda = rows.find((row) => row.lg_code === '131016');
        expect(chiyoda).toBeDefined();
        expect(chiyoda?.pref).toBe('東京都');
        expect(chiyoda?.city).toBe('千代田区');

        // The columns the ward and merger rules turn on. An empty string is a
        // present column with no value; undefined is a column that went away.
        const hamamatsu = rows.find((row) => row.lg_code === '221384');
        expect(hamamatsu?.ward).toBe('中央区');
        expect(hamamatsu?.efct_date).not.toBeUndefined();
        expect(hamamatsu?.ablt_date).not.toBeUndefined();
    });

    // Columns are covered by the fetch itself, so what is left to ask is whether
    // the file arrived whole. Same threshold as the master above.
    it('serves a position file that arrived whole', async () => {
        const positions = await fetchPositions();

        expect(positions.length).toBeGreaterThan(1700);
        expect(positions.find((position) => position.lg_code === '131016')).toBeDefined();
    });
});
