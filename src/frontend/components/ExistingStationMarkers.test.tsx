/**
 * @vitest-environment jsdom
 */

import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockFeature, createMockMap, createMockStations, setupGoogleMapsMock } from '#test-utils/test-utils';
import type { StyleOptions } from '../google-maps-types';
import { fetchStations } from '../station';
import { ExistingStationMarkers } from './ExistingStationMarkers';

vi.mock('../station', () => ({
    fetchStations: vi.fn(),
}));

const stations = createMockStations(3);
const noop = () => {};

describe('ExistingStationMarkers', () => {
    beforeEach(() => {
        setupGoogleMapsMock();
        vi.mocked(fetchStations).mockResolvedValue(stations);
    });

    it('renders nothing to the DOM', async () => {
        const mockMap = createMockMap();
        const { container } = render(<ExistingStationMarkers map={mockMap} onSelect={noop} />);
        await waitFor(() => expect(mockMap.data.addGeoJson).toHaveBeenCalled());
        expect(container.firstChild).toBeNull();
    });

    it('adds the fetched GeoJSON on mount', async () => {
        const mockMap = createMockMap();
        render(<ExistingStationMarkers map={mockMap} onSelect={noop} />);
        await waitFor(() => expect(mockMap.data.addGeoJson).toHaveBeenCalledWith(stations));
    });

    it('is hidden below MIN_VISIBLE_ZOOM and shown once zoomed in past it', async () => {
        const mockMap = createMockMap();
        mockMap._setZoom(6);
        render(<ExistingStationMarkers map={mockMap} onSelect={noop} />);
        await waitFor(() => expect(mockMap.data.setStyle).toHaveBeenCalledTimes(1));

        const styleAtZoom6 = mockMap.data.setStyle.mock.calls[0][0] as () => StyleOptions;
        expect(styleAtZoom6()).toMatchObject({ visible: false, clickable: false });

        mockMap._setZoom(10);
        mockMap._emit('zoom_changed', {});
        expect(mockMap.data.setStyle).toHaveBeenCalledTimes(2);
        const styleAtZoom10 = mockMap.data.setStyle.mock.calls[1][0] as () => StyleOptions;
        expect(styleAtZoom10()).toMatchObject({ visible: true, clickable: true });
    });

    it('does not re-apply the style on a zoom change that does not cross MIN_VISIBLE_ZOOM', async () => {
        const mockMap = createMockMap();
        mockMap._setZoom(12);
        render(<ExistingStationMarkers map={mockMap} onSelect={noop} />);
        await waitFor(() => expect(mockMap.data.setStyle).toHaveBeenCalledTimes(1));

        mockMap._setZoom(15);
        mockMap._emit('zoom_changed', {});
        expect(mockMap.data.setStyle).toHaveBeenCalledTimes(1);
    });

    it('reports the clicked feature through onSelect', async () => {
        const mockMap = createMockMap();
        const onSelect = vi.fn();
        render(<ExistingStationMarkers map={mockMap} onSelect={onSelect} />);
        await waitFor(() => expect(mockMap.data.addGeoJson).toHaveBeenCalled());

        const feature = createMockFeature('18786', { name: '道の駅 テスト' });
        mockMap.data._emit('click', { feature });

        expect(onSelect).toHaveBeenCalledWith(feature);
    });

    it('removes all features from map.data on unmount', async () => {
        const mockMap = createMockMap();
        const mockFeatures = [createMockFeature('18786'), createMockFeature('18787')];
        mockMap.data._setFeatures(mockFeatures);

        const { unmount } = render(<ExistingStationMarkers map={mockMap} onSelect={noop} />);
        await waitFor(() => expect(mockMap.data.addGeoJson).toHaveBeenCalled());

        unmount();

        expect(mockMap.data.remove).toHaveBeenCalledTimes(mockFeatures.length);
        for (const feature of mockFeatures) {
            expect(mockMap.data.remove).toHaveBeenCalledWith(feature);
        }
    });
});
