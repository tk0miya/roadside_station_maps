/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { Markers } from './Markers';
import { createMockFeature, createMockStations } from '../../test-utils/test-utils';
import { MemoryStorage } from '../storage/memory-storage';

const createMockMapData = () => {
    let features: google.maps.Data.Feature[] = [];
    return {
        addGeoJson: vi.fn(),
        addListener: vi.fn(() => ({ remove: vi.fn() })),
        setStyle: vi.fn(),
        overrideStyle: vi.fn(),
        forEach: vi.fn((cb: (f: google.maps.Data.Feature) => void) => features.forEach(cb)),
        remove: vi.fn((f: google.maps.Data.Feature) => {
            features = features.filter((x) => x !== f);
        }),
        _setFeatures: (fs: google.maps.Data.Feature[]) => { features = fs; },
    };
};

describe('Markers', () => {
    let mockMapData: ReturnType<typeof createMockMapData>;
    let mockMap: google.maps.Map;
    let storage: MemoryStorage;
    const stations = createMockStations(3);

    beforeEach(() => {
        vi.clearAllMocks();
        mockMapData = createMockMapData();
        mockMap = { data: mockMapData } as unknown as google.maps.Map;
        storage = new MemoryStorage();
    });

    it('renders nothing to the DOM', () => {
        const { container } = render(
            <Markers
                map={mockMap}
                selectedFeature={null}
                onFeatureSelect={() => {}}
                storage={storage}
                stations={stations}
                onStyleChange={() => {}}
            />
        );
        expect(container.firstChild).toBeNull();
    });

    it('adds GeoJSON features on mount', () => {
        render(
            <Markers
                map={mockMap}
                selectedFeature={null}
                onFeatureSelect={() => {}}
                storage={storage}
                stations={stations}
                onStyleChange={() => {}}
            />
        );
        expect(mockMapData.addGeoJson).toHaveBeenCalledWith(stations);
    });

    it('removes all features from map.data on unmount', () => {
        const mockFeatures = [createMockFeature('18786'), createMockFeature('18787')];
        mockMapData._setFeatures(mockFeatures);

        const { unmount } = render(
            <Markers
                map={mockMap}
                selectedFeature={null}
                onFeatureSelect={() => {}}
                storage={storage}
                stations={stations}
                onStyleChange={() => {}}
            />
        );

        unmount();

        expect(mockMapData.remove).toHaveBeenCalledTimes(mockFeatures.length);
        for (const f of mockFeatures) {
            expect(mockMapData.remove).toHaveBeenCalledWith(f);
        }
    });

    it('does not leave stale features when remounted after storage switch', () => {
        const mockFeatures = [createMockFeature('18786'), createMockFeature('18787')];
        mockMapData._setFeatures(mockFeatures);

        const props = {
            map: mockMap,
            selectedFeature: null as google.maps.Data.Feature | null,
            onFeatureSelect: vi.fn(),
            storage,
            stations,
            onStyleChange: vi.fn(),
        };

        const { unmount } = render(<Markers {...props} />);
        expect(mockMapData.addGeoJson).toHaveBeenCalledTimes(1);

        // Simulate Markers unmounting due to storage=null during login
        unmount();
        expect(mockMapData.remove).toHaveBeenCalledTimes(mockFeatures.length);

        // Remount with new storage
        render(<Markers {...props} storage={new MemoryStorage()} />);
        expect(mockMapData.addGeoJson).toHaveBeenCalledTimes(2);
    });
});
