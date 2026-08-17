/**
 * @vitest-environment jsdom
 */

import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockCustomPoint, createMockFeature, createMockMap, setupGoogleMapsMock } from '#test-utils/test-utils';
import { buildDirectionsURL, RouteButton } from './RouteButton';

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

describe('RouteButton', () => {
    let originalOpen: typeof window.open;

    beforeEach(() => {
        setupGoogleMapsMock();
        originalOpen = window.open;
    });

    afterEach(() => {
        window.open = originalOpen;
    });

    it('renders nothing while fewer than two stations are selected', () => {
        const mockMap = createMockMap();
        const feature = createMockFeature('1', { name: '三笠' });

        render(<RouteButton map={mockMap} multiSelected={[feature]} />);

        const controls = mockMap.controls[google.maps.ControlPosition.TOP_CENTER].getArray();
        expect(controls).toHaveLength(0);
    });

    it('mounts a button into TOP_CENTER controls once two stations are selected', () => {
        const mockMap = createMockMap();
        const features = [createMockFeature('1', { name: '三笠' }), createMockFeature('2', { name: 'びふか' })];

        render(<RouteButton map={mockMap} multiSelected={features} />);

        const controls = mockMap.controls[google.maps.ControlPosition.TOP_CENTER].getArray();
        expect(controls).toHaveLength(1);
        expect(controls[0].textContent).toBe('ルートを作成');
    });

    it('opens a Google Maps directions URL in a new tab on click', () => {
        const mockMap = createMockMap();
        const features = [createMockFeature('1', { name: '三笠' }), createMockFeature('2', { name: 'びふか' })];
        const openSpy = vi.fn();
        window.open = openSpy as unknown as typeof window.open;

        render(<RouteButton map={mockMap} multiSelected={features} />);

        const button = mockMap.controls[google.maps.ControlPosition.TOP_CENTER].getArray()[0];
        button.click();

        expect(openSpy).toHaveBeenCalledTimes(1);
        const [openedURL, target, features_] = openSpy.mock.calls[0];
        expect(openedURL).toBe(buildDirectionsURL(features));
        expect(target).toBe('_blank');
        expect(features_).toBe('noopener');
    });

    it('removes the button when the selection drops below two stations', () => {
        const mockMap = createMockMap();
        const features = [createMockFeature('1', { name: '三笠' }), createMockFeature('2', { name: 'びふか' })];

        const { rerender } = render(<RouteButton map={mockMap} multiSelected={features} />);

        let controls = mockMap.controls[google.maps.ControlPosition.TOP_CENTER].getArray();
        expect(controls).toHaveLength(1);

        rerender(<RouteButton map={mockMap} multiSelected={[features[0]]} />);

        controls = mockMap.controls[google.maps.ControlPosition.TOP_CENTER].getArray();
        expect(controls).toHaveLength(0);
    });
});
