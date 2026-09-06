/**
 * @vitest-environment jsdom
 */

import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockFeature, createMockMap, setupGoogleMapsMock } from '#test-utils/test-utils';
import { ExistingStationInfoWindow } from './ExistingStationInfoWindow';

describe('ExistingStationInfoWindow', () => {
    beforeEach(() => {
        setupGoogleMapsMock();
    });

    it('renders nothing to the DOM', () => {
        const mockMap = createMockMap();
        const { container } = render(<ExistingStationInfoWindow map={mockMap} selected={null} />);
        expect(container.firstChild).toBeNull();
    });

    it('opens at the feature position with its name as a plain text node', () => {
        const mockMap = createMockMap();
        const feature = createMockFeature('18786', { name: '道の駅 テスト' }, { lat: 35.0, lng: 139.0 });

        render(<ExistingStationInfoWindow map={mockMap} selected={feature} />);

        const infoWindow = vi.mocked(google.maps.InfoWindow).mock.results[0].value;
        expect(infoWindow.setOptions).toHaveBeenCalledTimes(1);
        const options = infoWindow.setOptions.mock.calls[0][0];
        expect(options.position.lat()).toBe(35.0);
        expect(options.position.lng()).toBe(139.0);
        // A Text node, not an HTML string: the name is untrusted scraped data
        // and must never be parsed as markup.
        expect(options.content).toBeInstanceOf(Text);
        expect(options.content.textContent).toBe('道の駅 テスト');
        expect(infoWindow.open).toHaveBeenCalledWith(mockMap);
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
