import { describe, expect, it } from 'vitest';
import { getPrefectures, getStationDetails, getStations, stripStationPrefix } from './generate-stationlist';

// These tests hit michi-no-eki.jp for real, so that a change to the site's
// markup shows up here instead of in the weekly data update. Claude Code on
// the web denies egress to the site (403 on CONNECT), so skip them there
// rather than let every `npm run ci` fail on an unreachable host.
const isClaudeCodeWeb = process.env.CLAUDE_CODE_REMOTE === 'true';

describe('stripStationPrefix', () => {
    it('should remove a leading 道の駅 prefix', () => {
        expect(stripStationPrefix('道の駅きたごう')).toBe('きたごう');
        expect(stripStationPrefix('道の駅「安達」智恵子の里 上り線')).toBe('「安達」智恵子の里 上り線');
    });

    it('should remove the whitespace following the prefix', () => {
        expect(stripStationPrefix('道の駅 きたごう')).toBe('きたごう');
        expect(stripStationPrefix('道の駅　きたごう')).toBe('きたごう');
    });

    it('should keep 道の駅 that is not a prefix', () => {
        expect(stripStationPrefix('あ・ら・伊達な道の駅')).toBe('あ・ら・伊達な道の駅');
        expect(stripStationPrefix('北欧の風 道の駅とうべつ')).toBe('北欧の風 道の駅とうべつ');
        expect(stripStationPrefix('まきのさんの道の駅・佐川')).toBe('まきのさんの道の駅・佐川');
    });

    it('should keep a name without the prefix as is', () => {
        expect(stripStationPrefix('箱根峠')).toBe('箱根峠');
    });
});

describe.skipIf(isClaudeCodeWeb)('generate_stationlist', () => {
    describe('getPrefectures', () => {
        it('should fetch and parse prefecture list from michi-no-eki.jp', async () => {
            // Execute the function with real HTTP request
            const prefectures = await Array.fromAsync(getPrefectures());

            // Japan has 47 prefectures
            expect(prefectures).toHaveLength(47);

            // Check for specific known prefectures (should always exist)
            const prefectureNames = prefectures.map((p) => p.name);

            // Check if we have some expected prefectures
            // Note: Prefecture names on the site don't include suffixes like '都', '府', '県'
            expect(prefectureNames).toContain('北海道');
            expect(prefectureNames).toContain('東京');
            expect(prefectureNames).toContain('大阪');
            expect(prefectureNames).toContain('沖縄');
        });
    });

    describe('getStations', () => {
        it('should fetch and parse station list for Iwate with pagination', async () => {
            // Use Iwate prefecture (ID: 13) to test pagination functionality
            const iwate = {
                id: '13',
                name: '岩手',
                uri: '/stations/search/13/all/all',
            };

            // Execute the function with real HTTP request
            const stations = await Array.fromAsync(getStations(iwate));

            // Iwate has exactly 39 stations
            expect(stations).toHaveLength(39);

            // Verify all stations have the correct prefecture ID
            stations.forEach((station) => {
                expect(station.prefId).toBe('13');
            });

            // Check for known stations in Iwate
            const stationNames = stations.map((s) => s.name);
            expect(stationNames).toContain('石鳥谷');
            expect(stationNames).toContain('区界高原');
        });
    });

    describe('getStationDetails', () => {
        it('should fetch and parse station details from a specific station page', async () => {
            // Test with station ID 19150 (Hakone-toge in Kanagawa)
            const stationUri = '/stations/views/19150';
            const prefId = '23'; // Kanagawa

            const station = await getStationDetails(stationUri, prefId);

            // Verify prefecture ID (passed as parameter)
            expect(station.prefId).toBe('23');

            // Verify station ID (extracted from URI)
            expect(station.stationId).toBe('19150');

            // Verify station name
            expect(station.name).toBe('箱根峠');

            // Verify address
            expect(station.address).toContain('神奈川県');

            // Verify hours (just check that it has some value, as it changes frequently)
            expect(station.hours.length).toBeGreaterThan(0);

            // Verify URI
            expect(station.uri).toContain('/stations/views/19150');

            // Verify coordinates were parsed out of the page
            expect(station.lat).not.toBeNull();
            expect(station.lng).not.toBeNull();
            expect(station.lat).toBeGreaterThan(35); // Rough latitude check for Kanagawa
            expect(station.lat).toBeLessThan(36);
            expect(station.lng).toBeGreaterThan(138); // Rough longitude check for Kanagawa
            expect(station.lng).toBeLessThan(140);
        });

        it('should drop the 道の駅 prefix the site puts on some station names', async () => {
            // Station 22061 (Kitagou in Miyazaki) is registered as "道の駅きたごう"
            const station = await getStationDetails('/stations/views/22061', '54');

            expect(station.name).toBe('きたごう');
        });
    });
});
