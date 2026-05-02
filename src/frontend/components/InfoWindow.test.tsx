/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { InfoWindow } from './InfoWindow';
import { StyleManager } from '../style-manager';
import { QueryStorage } from '../storage/query-storage';
import { createMockFeature } from '../../test-utils/test-utils';

// Mock Google Maps API
const mockInfoWindow = {
    setOptions: vi.fn(),
    open: vi.fn(),
    close: vi.fn(),
};

const mockOverrideStyle = vi.fn();
const mockMap = {
    data: {
        overrideStyle: mockOverrideStyle,
    },
} as unknown as google.maps.Map;

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

const createStyleManager = () => new StyleManager(new QueryStorage());

describe('InfoWindow', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return null (no visual rendering)', () => {
        const { container } = render(
            <InfoWindow
                selectedFeature={null}
                map={null}
                styleManager={createStyleManager()}
                onStyleChange={() => {}}
            />
        );
        expect(container.firstChild).toBeNull();
    });

    it('should create InfoWindow and content element on mount', () => {
        render(
            <InfoWindow
                selectedFeature={null}
                map={null}
                styleManager={createStyleManager()}
                onStyleChange={() => {}}
            />
        );

        expect(google.maps.InfoWindow).toHaveBeenCalled();
    });

    it('should close InfoWindow when selectedFeature is null', () => {
        render(
            <InfoWindow
                selectedFeature={null}
                map={mockMap}
                styleManager={createStyleManager()}
                onStyleChange={() => {}}
            />
        );

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

        render(
            <InfoWindow
                selectedFeature={mockFeature as any}
                map={mockMap}
                styleManager={createStyleManager()}
                onStyleChange={() => {}}
            />
        );

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

        render(
            <InfoWindow
                selectedFeature={mockFeature as any}
                map={mockMap}
                styleManager={createStyleManager()}
                onStyleChange={() => {}}
            />
        );

        const setOptionsCall = mockInfoWindow.setOptions.mock.calls[0][0];
        const contentElement = setOptionsCall.content as HTMLElement;

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(contentElement.textContent).toContain(mockFeature.getProperty('name'));
        expect(contentElement.textContent).toContain(`営業時間：${mockFeature.getProperty('hours')}`);
        expect(contentElement.textContent).toContain(`住所：${mockFeature.getProperty('address')}`);
        expect(contentElement.textContent).toContain(`マップコード：${mockFeature.getProperty('mapcode')}`);

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

        const styleManager = createStyleManager();
        const { rerender } = render(
            <InfoWindow
                selectedFeature={mockFeatureA as any}
                map={mockMap}
                styleManager={styleManager}
                onStyleChange={() => {}}
            />
        );

        const firstSetOptionsCall = mockInfoWindow.setOptions.mock.calls[0][0];
        const firstContentElement = firstSetOptionsCall.content as HTMLElement;

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(firstContentElement.textContent).toContain(mockFeatureA.getProperty('name'));
        expect(firstContentElement.textContent).toContain(`住所：${mockFeatureA.getProperty('address')}`);

        rerender(
            <InfoWindow
                selectedFeature={mockFeatureB as any}
                map={mockMap}
                styleManager={styleManager}
                onStyleChange={() => {}}
            />
        );

        const secondSetOptionsCall = mockInfoWindow.setOptions.mock.calls[1][0];
        const secondContentElement = secondSetOptionsCall.content as HTMLElement;

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(secondContentElement.textContent).toContain(mockFeatureB.getProperty('name'));
        expect(secondContentElement.textContent).toContain(`住所：${mockFeatureB.getProperty('address')}`);
    });

    it('should render color picker buttons for every available style', async () => {
        const mockFeature = createMockFeature('A', { name: 'Station A' });

        render(
            <InfoWindow
                selectedFeature={mockFeature as any}
                map={mockMap}
                styleManager={createStyleManager()}
                onStyleChange={() => {}}
            />
        );

        const setOptionsCall = mockInfoWindow.setOptions.mock.calls[0][0];
        const contentElement = setOptionsCall.content as HTMLElement;

        await new Promise(resolve => setTimeout(resolve, 10));

        const buttons = contentElement.querySelectorAll('button.color-picker-button');
        expect(buttons.length).toBe(5);

        const selectedButtons = contentElement.querySelectorAll('button.color-picker-button.selected');
        expect(selectedButtons.length).toBe(1);
        expect(selectedButtons[0].getAttribute('aria-label')).toBe('color-0');
    });

    it('should change marker style and notify when a color button is clicked', async () => {
        const mockFeature = createMockFeature('A', { name: 'Station A' });
        const styleManager = createStyleManager();
        const onStyleChange = vi.fn();

        render(
            <InfoWindow
                selectedFeature={mockFeature as any}
                map={mockMap}
                styleManager={styleManager}
                onStyleChange={onStyleChange}
            />
        );

        const setOptionsCall = mockInfoWindow.setOptions.mock.calls[0][0];
        const contentElement = setOptionsCall.content as HTMLElement;

        await new Promise(resolve => setTimeout(resolve, 10));

        const targetButton = contentElement.querySelector(
            'button.color-picker-button[aria-label="color-2"]'
        ) as HTMLButtonElement;
        expect(targetButton).not.toBeNull();
        targetButton.click();

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(styleManager.getCurrentStyleId(mockFeature.getProperty('stationId') as string)).toBe(2);
        expect(mockOverrideStyle).toHaveBeenCalledWith(mockFeature, {
            icon: 'https://maps.google.com/mapfiles/ms/icons/purple-dot.png',
        });
        expect(onStyleChange).toHaveBeenCalled();
    });

    it('should reset marker style when clicking the default color', async () => {
        const mockFeature = createMockFeature('A', { name: 'Station A' });
        const styleManager = createStyleManager();
        styleManager.setStyle(mockFeature.getProperty('stationId') as string, 3);
        const onStyleChange = vi.fn();

        render(
            <InfoWindow
                selectedFeature={mockFeature as any}
                map={mockMap}
                styleManager={styleManager}
                onStyleChange={onStyleChange}
            />
        );

        const setOptionsCall = mockInfoWindow.setOptions.mock.calls[0][0];
        const contentElement = setOptionsCall.content as HTMLElement;

        await new Promise(resolve => setTimeout(resolve, 10));

        const defaultButton = contentElement.querySelector(
            'button.color-picker-button[aria-label="color-0"]'
        ) as HTMLButtonElement;
        defaultButton.click();

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(styleManager.getCurrentStyleId(mockFeature.getProperty('stationId') as string)).toBe(0);
        expect(onStyleChange).toHaveBeenCalled();
    });
});
