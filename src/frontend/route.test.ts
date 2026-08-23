import { describe, expect, it } from 'vitest';
import { createMockCustomPoint, createMockFeature, createMockLatLng } from '#test-utils/test-utils';
import { buildDirectionsURL, clearsSelectionOnMapClick, hasPointAt } from './route';

describe('buildDirectionsURL', () => {
    it('appends the prefecture, telling two stations sharing a name apart', () => {
        const features = [
            createMockFeature('1', { name: 'さかい', prefName: '茨城県' }),
            createMockFeature('2', { name: 'さかい', prefName: '福井県' }),
        ];

        const url = new URL(buildDirectionsURL(features));

        expect(url.origin + url.pathname).toBe('https://www.google.com/maps/dir/');
        expect(url.searchParams.get('api')).toBe('1');
        expect(url.searchParams.get('origin')).toBe('道の駅 さかい 茨城県');
        expect(url.searchParams.get('destination')).toBe('道の駅 さかい 福井県');
    });

    it('writes a custom route point as its coordinate', () => {
        const features = [createMockCustomPoint(43.7708, 142.365), createMockFeature('2', { name: 'びふか' })];

        const url = new URL(buildDirectionsURL(features));

        expect(url.searchParams.get('origin')).toBe('43.770800,142.365000');
        expect(url.searchParams.get('destination')).toBe('道の駅 びふか 北海道');
    });

    it('omits the waypoints parameter when only two stops are given', () => {
        const features = [createMockFeature('1', { name: '三笠' }), createMockFeature('2', { name: 'びふか' })];

        const url = new URL(buildDirectionsURL(features));

        expect(url.searchParams.has('waypoints')).toBe(false);
    });

    it('joins intermediate stops into the waypoints parameter with "|"', () => {
        const features = [
            createMockFeature('1', { name: '三笠' }),
            createMockFeature('2', { name: 'スタープラザ 芦別' }),
            createMockCustomPoint(43.0, 142.0),
            createMockFeature('4', { name: 'びふか' }),
        ];

        const url = new URL(buildDirectionsURL(features));

        expect(url.searchParams.get('origin')).toBe('道の駅 三笠 北海道');
        expect(url.searchParams.get('destination')).toBe('道の駅 びふか 北海道');
        expect(url.searchParams.get('waypoints')).toBe('道の駅 スタープラザ 芦別 北海道|43.000000,142.000000');
    });

    it('handles the maximum 9-stop route (7 waypoints)', () => {
        const features = Array.from({ length: 9 }, (_, i) => createMockFeature(`${i}`, { name: `S${i}` }));

        const url = new URL(buildDirectionsURL(features));

        expect(url.searchParams.get('origin')).toBe('道の駅 S0 北海道');
        expect(url.searchParams.get('destination')).toBe('道の駅 S8 北海道');
        expect(url.searchParams.get('waypoints')?.split('|')).toEqual([
            '道の駅 S1 北海道',
            '道の駅 S2 北海道',
            '道の駅 S3 北海道',
            '道の駅 S4 北海道',
            '道の駅 S5 北海道',
            '道の駅 S6 北海道',
            '道の駅 S7 北海道',
        ]);
    });
});

describe('hasPointAt', () => {
    it('finds the custom point already standing there', () => {
        const stops = [createMockCustomPoint(36.5, 140.5)];

        expect(hasPointAt(stops, createMockLatLng(36.5, 140.5))).toBe(true);
    });

    // A station at the same spot is a stop of its own, and a point beside it is
    // the user's to place: only a point over a point is the pressed-twice case.
    it('leaves a station standing there out of it', () => {
        const stops = [createMockFeature('1', {}, { lat: 36.5, lng: 140.5 })];

        expect(hasPointAt(stops, createMockLatLng(36.5, 140.5))).toBe(false);
    });

    // Coordinates are compared to the same 6 places the route URL carries, so a
    // difference the URL would not keep is not a different place either.
    it('reads a difference past the sixth decimal place as the same place', () => {
        const stops = [createMockCustomPoint(36.5, 140.5)];

        expect(hasPointAt(stops, createMockLatLng(36.5000001, 140.5))).toBe(true);
        expect(hasPointAt(stops, createMockLatLng(36.500001, 140.5))).toBe(false);
    });
});

describe('clearsSelectionOnMapClick', () => {
    const context = (overrides: Partial<Parameters<typeof clearsSelectionOnMapClick>[0]> = {}) => ({
        modifierPressed: false,
        routeMode: false,
        ...overrides,
    });

    it('clears on a plain click outside route editing', () => {
        expect(clearsSelectionOnMapClick(context())).toBe(true);
    });

    it('keeps the route on the click that precedes dropping a point', () => {
        expect(clearsSelectionOnMapClick(context({ modifierPressed: true }))).toBe(false);
    });

    it('keeps the route while route mode is on', () => {
        expect(clearsSelectionOnMapClick(context({ routeMode: true }))).toBe(false);
    });
});
