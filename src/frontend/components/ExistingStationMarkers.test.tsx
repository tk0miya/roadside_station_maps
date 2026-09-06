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

describe('ExistingStationMarkers', () => {
    beforeEach(() => {
        setupGoogleMapsMock();
        vi.mocked(fetchStations).mockResolvedValue(stations);
    });

    it('renders nothing to the DOM', async () => {
        const mockMap = createMockMap();
        const { container } = render(<ExistingStationMarkers map={mockMap} />);
        await waitFor(() => expect(mockMap.data.addGeoJson).toHaveBeenCalled());
        expect(container.firstChild).toBeNull();
    });

    it('adds the fetched GeoJSON on mount', async () => {
        const mockMap = createMockMap();
        render(<ExistingStationMarkers map={mockMap} />);
        await waitFor(() => expect(mockMap.data.addGeoJson).toHaveBeenCalledWith(stations));
    });

    it('is hidden below MIN_VISIBLE_ZOOM and shown once zoomed in past it', async () => {
        const mockMap = createMockMap();
        mockMap._setZoom(6);
        render(<ExistingStationMarkers map={mockMap} />);
        await waitFor(() => expect(mockMap.data.setStyle).toHaveBeenCalledTimes(1));

        const styleAtZoom6 = mockMap.data.setStyle.mock.calls[0][0] as () => StyleOptions;
        expect(styleAtZoom6()).toMatchObject({ visible: false, clickable: false });

        mockMap._setZoom(10);
        mockMap._emit('zoom_changed', {});
        expect(mockMap.data.setStyle).toHaveBeenCalledTimes(2);
        const styleAtZoom10 = mockMap.data.setStyle.mock.calls[1][0] as () => StyleOptions;
        expect(styleAtZoom10()).toMatchObject({ visible: true, clickable: false });
    });

    it('does not re-apply the style on a zoom change that does not cross MIN_VISIBLE_ZOOM', async () => {
        const mockMap = createMockMap();
        mockMap._setZoom(12);
        render(<ExistingStationMarkers map={mockMap} />);
        await waitFor(() => expect(mockMap.data.setStyle).toHaveBeenCalledTimes(1));

        mockMap._setZoom(15);
        mockMap._emit('zoom_changed', {});
        expect(mockMap.data.setStyle).toHaveBeenCalledTimes(1);
    });

    it('removes all features from map.data on unmount', async () => {
        const mockMap = createMockMap();
        const mockFeatures = [createMockFeature('18786'), createMockFeature('18787')];
        mockMap.data._setFeatures(mockFeatures);

        const { unmount } = render(<ExistingStationMarkers map={mockMap} />);
        await waitFor(() => expect(mockMap.data.addGeoJson).toHaveBeenCalled());

        unmount();

        expect(mockMap.data.remove).toHaveBeenCalledTimes(mockFeatures.length);
        for (const feature of mockFeatures) {
            expect(mockMap.data.remove).toHaveBeenCalledWith(feature);
        }
    });
});
