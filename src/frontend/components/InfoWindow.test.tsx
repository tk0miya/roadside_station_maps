/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { InfoWindow } from './InfoWindow';
import { createMockFeature } from '../../test-utils/test-utils';

// Mock Google Maps API
const mockInfoWindow = {
    setOptions: vi.fn(),
    open: vi.fn(),
    close: vi.fn(),
};


const mockMap = {} as google.maps.Map;

Object.defineProperty(global, 'google', {
    value: {
        maps: {
            InfoWindow: vi.fn(function () {
                return mockInfoWindow;
            }),
            Size: vi.fn(function () {}),
        },
    },
    writable: true,
});

describe('InfoWindow', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return null (no visual rendering)', () => {
        const { container } = render(<InfoWindow selectedFeature={null} map={null} />);
        expect(container.firstChild).toBeNull();
    });

    it('should create InfoWindow and content element on mount', () => {
        render(<InfoWindow selectedFeature={null} map={null} />);

        expect(google.maps.InfoWindow).toHaveBeenCalled();
    });

    it('should close InfoWindow when selectedFeature is null', () => {
        render(<InfoWindow selectedFeature={null} map={mockMap} />);

        expect(mockInfoWindow.close).toHaveBeenCalled();
        expect(mockInfoWindow.open).not.toHaveBeenCalled();
    });

    it('should open InfoWindow when selectedFeature is provided', () => {
        const mockFeature = createMockFeature('A', {
            name: 'Station A',
            uri: 'https://example.com/station-a',
            address: 'Address A',
            mapcode: '123 456*78',
        });

        render(<InfoWindow selectedFeature={mockFeature as any} map={mockMap} />);

        expect(mockInfoWindow.setOptions).toHaveBeenCalledWith({
            position: { lat: 35.0, lng: 139.0 },
            content: expect.any(HTMLElement),
            headerDisabled: true,
            pixelOffset: expect.any(Object),
        });
        expect(mockInfoWindow.open).toHaveBeenCalledWith(mockMap);
    });

    it('should set correct content with station information in InfoWindow options', async () => {
        const mockFeature = createMockFeature('A', {
            name: 'Station A',
            uri: 'https://example.com/station-a',
            address: 'Address A',
            mapcode: '123 456*78',
        });

        render(<InfoWindow selectedFeature={mockFeature as any} map={mockMap} />);

        expect(mockInfoWindow.setOptions).toHaveBeenCalledWith({
            position: { lat: 35.0, lng: 139.0 },
            content: expect.any(HTMLElement),
            headerDisabled: true,
            pixelOffset: expect.any(Object),
        });

        // Get the content element that was passed
        const setOptionsCall = mockInfoWindow.setOptions.mock.calls[0][0];
        const contentElement = setOptionsCall.content as HTMLElement;

        // Wait a bit for React to render the content
        await new Promise(resolve => setTimeout(resolve, 10));

        // Check that station information is included in the content
        expect(contentElement.textContent).toContain(mockFeature.getProperty('name'));
        expect(contentElement.textContent).toContain(`営業時間：${mockFeature.getProperty('hours')}`);
        expect(contentElement.textContent).toContain(`住所：${mockFeature.getProperty('address')}`);
        expect(contentElement.textContent).toContain(`マップコード：${mockFeature.getProperty('mapcode')}`);

        // Check that the link is present
        const expectedLink = `<a href="${mockFeature.getProperty('uri')}" target="_blank">${mockFeature.getProperty('name')}</a>`;
        expect(contentElement.innerHTML).toContain(expectedLink);
    });

    it('should update InfoWindow content when selectedFeature changes', async () => {
        const mockFeatureA = createMockFeature('A', {
            name: 'Station A',
            address: 'Address A',
        });

        const mockFeatureB = createMockFeature('B', {
            name: 'Station B',
            address: 'Address B',
        });

        const { rerender } = render(<InfoWindow selectedFeature={mockFeatureA as any} map={mockMap} />);

        // Get the content element from the first feature
        const firstSetOptionsCall = mockInfoWindow.setOptions.mock.calls[0][0];
        const firstContentElement = firstSetOptionsCall.content as HTMLElement;

        // Wait for React to render
        await new Promise(resolve => setTimeout(resolve, 10));

        // Verify first feature content
        expect(firstContentElement.textContent).toContain(mockFeatureA.getProperty('name'));
        expect(firstContentElement.textContent).toContain(`住所：${mockFeatureA.getProperty('address')}`);

        // Change to feature B
        rerender(<InfoWindow selectedFeature={mockFeatureB as any} map={mockMap} />);

        // Get the content element from the second feature
        const secondSetOptionsCall = mockInfoWindow.setOptions.mock.calls[1][0];
        const secondContentElement = secondSetOptionsCall.content as HTMLElement;

        // Wait for React to render the new content
        await new Promise(resolve => setTimeout(resolve, 10));

        // Verify second feature content has changed
        expect(secondContentElement.textContent).toContain(mockFeatureB.getProperty('name'));
        expect(secondContentElement.textContent).toContain(`住所：${mockFeatureB.getProperty('address')}`);
    });
});
