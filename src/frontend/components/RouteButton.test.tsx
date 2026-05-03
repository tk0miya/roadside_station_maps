/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { buildDirectionsURL, RouteButton } from './RouteButton';
import { createMockFeature, createMockMap, setupGoogleMapsMock } from '@test-utils/test-utils';

describe('buildDirectionsURL', () => {
    it('uses "道の駅 <name>" labels for origin and destination', () => {
        const features = [
            createMockFeature('1', { name: '三笠' }),
            createMockFeature('2', { name: 'びふか' }),
        ];

        const url = new URL(buildDirectionsURL(features));

        expect(url.origin + url.pathname).toBe('https://www.google.com/maps/dir/');
        expect(url.searchParams.get('api')).toBe('1');
        expect(url.searchParams.get('origin')).toBe('道の駅 三笠');
        expect(url.searchParams.get('destination')).toBe('道の駅 びふか');
    });

    it('omits the waypoints parameter when only two stations are given', () => {
        const features = [
            createMockFeature('1', { name: '三笠' }),
            createMockFeature('2', { name: 'びふか' }),
        ];

        const url = new URL(buildDirectionsURL(features));

        expect(url.searchParams.has('waypoints')).toBe(false);
    });

    it('joins intermediate stations into the waypoints parameter with "|"', () => {
        const features = [
            createMockFeature('1', { name: '三笠' }),
            createMockFeature('2', { name: 'スタープラザ 芦別' }),
            createMockFeature('3', { name: '南ふらの' }),
            createMockFeature('4', { name: 'びふか' }),
        ];

        const url = new URL(buildDirectionsURL(features));

        expect(url.searchParams.get('origin')).toBe('道の駅 三笠');
        expect(url.searchParams.get('destination')).toBe('道の駅 びふか');
        expect(url.searchParams.get('waypoints')).toBe(
            '道の駅 スタープラザ 芦別|道の駅 南ふらの',
        );
    });

    it('handles the maximum 9-station route (7 waypoints)', () => {
        const features = Array.from({ length: 9 }, (_, i) =>
            createMockFeature(`${i}`, { name: `S${i}` }),
        );

        const url = new URL(buildDirectionsURL(features));

        expect(url.searchParams.get('origin')).toBe('道の駅 S0');
        expect(url.searchParams.get('destination')).toBe('道の駅 S8');
        expect(url.searchParams.get('waypoints')?.split('|')).toEqual([
            '道の駅 S1',
            '道の駅 S2',
            '道の駅 S3',
            '道の駅 S4',
            '道の駅 S5',
            '道の駅 S6',
            '道の駅 S7',
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
        const features = [
            createMockFeature('1', { name: '三笠' }),
            createMockFeature('2', { name: 'びふか' }),
        ];

        render(<RouteButton map={mockMap} multiSelected={features} />);

        const controls = mockMap.controls[google.maps.ControlPosition.TOP_CENTER].getArray();
        expect(controls).toHaveLength(1);
        expect(controls[0].textContent).toBe('ルートを作成');
    });

    it('opens a Google Maps directions URL in a new tab on click', () => {
        const mockMap = createMockMap();
        const features = [
            createMockFeature('1', { name: '三笠' }),
            createMockFeature('2', { name: 'びふか' }),
        ];
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
        const features = [
            createMockFeature('1', { name: '三笠' }),
            createMockFeature('2', { name: 'びふか' }),
        ];

        const { rerender } = render(<RouteButton map={mockMap} multiSelected={features} />);

        let controls = mockMap.controls[google.maps.ControlPosition.TOP_CENTER].getArray();
        expect(controls).toHaveLength(1);

        rerender(<RouteButton map={mockMap} multiSelected={[features[0]]} />);

        controls = mockMap.controls[google.maps.ControlPosition.TOP_CENTER].getArray();
        expect(controls).toHaveLength(0);
    });
});
