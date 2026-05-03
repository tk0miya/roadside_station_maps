/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { Markers } from './Markers';
import { createMockFeature, createMockMap, createMockStations } from '@test-utils/test-utils';
import { MemoryStorage } from '../storage/memory-storage';

describe('Markers', () => {
    const stations = createMockStations(3);

    it('renders nothing to the DOM', () => {
        const mockMap = createMockMap();
        const { container } = render(
            <Markers
                map={mockMap}
                selectedFeature={null}
                onFeatureSelect={() => {}}
                storage={new MemoryStorage()}
                stations={stations}
                onStyleChange={() => {}}
            />
        );
        expect(container.firstChild).toBeNull();
    });

    it('adds GeoJSON features on mount', () => {
        const mockMap = createMockMap();
        render(
            <Markers
                map={mockMap}
                selectedFeature={null}
                onFeatureSelect={() => {}}
                storage={new MemoryStorage()}
                stations={stations}
                onStyleChange={() => {}}
            />
        );
        expect(mockMap.data.addGeoJson).toHaveBeenCalledWith(stations);
    });

    it('removes all features from map.data on unmount', () => {
        const mockMap = createMockMap();
        const mockFeatures = [createMockFeature('18786'), createMockFeature('18787')];
        mockMap.data._setFeatures(mockFeatures);

        const { unmount } = render(
            <Markers
                map={mockMap}
                selectedFeature={null}
                onFeatureSelect={() => {}}
                storage={new MemoryStorage()}
                stations={stations}
                onStyleChange={() => {}}
            />
        );

        unmount();

        expect(mockMap.data.remove).toHaveBeenCalledTimes(mockFeatures.length);
        for (const f of mockFeatures) {
            expect(mockMap.data.remove).toHaveBeenCalledWith(f);
        }
    });

    it('does not leave stale features when remounted after storage switch', () => {
        const mockMap = createMockMap();
        const mockFeatures = [createMockFeature('18786'), createMockFeature('18787')];
        mockMap.data._setFeatures(mockFeatures);

        const props = {
            map: mockMap,
            selectedFeature: null as google.maps.Data.Feature | null,
            onFeatureSelect: vi.fn(),
            storage: new MemoryStorage(),
            stations,
            onStyleChange: vi.fn(),
        };

        const { unmount } = render(<Markers {...props} />);
        expect(mockMap.data.addGeoJson).toHaveBeenCalledTimes(1);

        // Simulate Markers unmounting due to storage=null during login
        unmount();
        expect(mockMap.data.remove).toHaveBeenCalledTimes(mockFeatures.length);

        // Remount with new storage
        render(<Markers {...props} storage={new MemoryStorage()} />);
        expect(mockMap.data.addGeoJson).toHaveBeenCalledTimes(2);
    });
});
