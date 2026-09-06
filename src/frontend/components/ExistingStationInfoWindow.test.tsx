/**
 * @vitest-environment jsdom
 */

import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockFeature, createMockMap, setupGoogleMapsMock } from '#test-utils/test-utils';
import { ExistingStationInfoWindow } from './ExistingStationInfoWindow';

// Renders the window and returns the element its content was rendered into.
async function content(feature: ReturnType<typeof createMockFeature>, map = createMockMap()): Promise<HTMLElement> {
    render(<ExistingStationInfoWindow map={map} selected={feature} />);
    const infoWindow = vi.mocked(google.maps.InfoWindow).mock.results[0].value;
    const element = infoWindow.setOptions.mock.calls[0][0].content as HTMLElement;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return element;
}

describe('ExistingStationInfoWindow', () => {
    beforeEach(() => {
        setupGoogleMapsMock();
    });

    it('renders nothing to the DOM', () => {
        const mockMap = createMockMap();
        const { container } = render(<ExistingStationInfoWindow map={mockMap} selected={null} />);
        expect(container.firstChild).toBeNull();
    });

    it('opens at the feature position with a "道の駅 <name>" link to its page', async () => {
        const mockMap = createMockMap();
        const feature = createMockFeature(
            '18786',
            { name: 'テスト', uri: 'https://www.michi-no-eki.jp/stations/views/18786' },
            { lat: 35.0, lng: 139.0 }
        );

        const element = await content(feature, mockMap);

        const infoWindow = vi.mocked(google.maps.InfoWindow).mock.results[0].value;
        const options = infoWindow.setOptions.mock.calls[0][0];
        expect(options.position.lat()).toBe(35.0);
        expect(options.position.lng()).toBe(139.0);

        const link = element.querySelector('a');
        expect(link?.textContent).toBe('道の駅 テスト');
        expect(link?.getAttribute('href')).toBe('https://www.michi-no-eki.jp/stations/views/18786');
        // The link points off-site, so it must not hand the opener to it.
        expect(link?.getAttribute('target')).toBe('_blank');
        expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
        expect(infoWindow.open).toHaveBeenCalledWith(mockMap);
    });

    it('escapes markup in the station name rather than rendering it as HTML', async () => {
        const feature = createMockFeature('18786', { name: '<img src=x onerror=alert(1)>' });

        const element = await content(feature);

        expect(element.querySelector('img')).toBeNull();
        expect(element.querySelector('a')?.textContent).toBe('道の駅 <img src=x onerror=alert(1)>');
    });

    it('closes when selected becomes null', () => {
        const mockMap = createMockMap();
        const feature = createMockFeature('18786');
        const { rerender } = render(<ExistingStationInfoWindow map={mockMap} selected={feature} />);
        const infoWindow = vi.mocked(google.maps.InfoWindow).mock.results[0].value;

        rerender(<ExistingStationInfoWindow map={mockMap} selected={null} />);

        expect(infoWindow.close).toHaveBeenCalled();
    });

    it('closes the info window on unmount', () => {
        const mockMap = createMockMap();
        const feature = createMockFeature('18786');
        const { unmount } = render(<ExistingStationInfoWindow map={mockMap} selected={feature} />);
        const infoWindow = vi.mocked(google.maps.InfoWindow).mock.results[0].value;

        unmount();

        expect(infoWindow.close).toHaveBeenCalled();
    });
});
