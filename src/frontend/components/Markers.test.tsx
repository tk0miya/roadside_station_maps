/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { Markers } from './Markers';
import {
    createMockFeature,
    createMockMap,
    createMockStations,
    setupGoogleMapsMock,
} from '@test-utils/test-utils';
import { MemoryStorage } from '../storage/memory-storage';

const buildClickEvent = (
    feature: google.maps.Data.Feature,
    modifier?: 'meta' | 'ctrl',
): google.maps.Data.MouseEvent =>
    ({
        feature,
        domEvent: {
            metaKey: modifier === 'meta',
            ctrlKey: modifier === 'ctrl',
        } as MouseEvent,
    }) as google.maps.Data.MouseEvent;

describe('Markers', () => {
    const stations = createMockStations(3);

    it('renders nothing to the DOM', () => {
        const mockMap = createMockMap();
        const { container } = render(
            <Markers
                map={mockMap}
                selectedFeature={null}
                onFeatureSelect={() => {}}
                multiSelected={[]}
                onMultiSelectChange={() => {}}
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
                multiSelected={[]}
                onMultiSelectChange={() => {}}
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
                multiSelected={[]}
                onMultiSelectChange={() => {}}
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

    describe('multi-select via modifier-click', () => {
        beforeEach(() => {
            setupGoogleMapsMock();
        });

        const renderMarkers = (
            overrides: {
                multiSelected?: google.maps.Data.Feature[];
                selectedFeature?: google.maps.Data.Feature | null;
            } = {},
        ) => {
            const mockMap = createMockMap();
            const onMultiSelectChange = vi.fn();
            const onFeatureSelect = vi.fn();
            render(
                <Markers
                    map={mockMap}
                    selectedFeature={overrides.selectedFeature ?? null}
                    onFeatureSelect={onFeatureSelect}
                    multiSelected={overrides.multiSelected ?? []}
                    onMultiSelectChange={onMultiSelectChange}
                    storage={new MemoryStorage()}
                    stations={stations}
                    onStyleChange={() => {}}
                />,
            );
            return { mockMap, onMultiSelectChange, onFeatureSelect };
        };

        const applyUpdater = (
            mock: ReturnType<typeof vi.fn>,
            prev: google.maps.Data.Feature[],
        ): google.maps.Data.Feature[] => {
            expect(mock).toHaveBeenCalledTimes(1);
            const updater = mock.mock.calls[0][0] as (
                p: google.maps.Data.Feature[],
            ) => google.maps.Data.Feature[];
            return updater(prev);
        };

        it('adds a feature to the route selection on Cmd-click', () => {
            const { mockMap, onMultiSelectChange, onFeatureSelect } = renderMarkers();
            const featureA = createMockFeature('A');

            mockMap.data._emit('click', buildClickEvent(featureA, 'meta'));

            expect(onFeatureSelect).toHaveBeenCalledWith(null);
            expect(applyUpdater(onMultiSelectChange, [])).toEqual([featureA]);
        });

        it('treats Ctrl-click the same as Cmd-click', () => {
            const { mockMap, onMultiSelectChange } = renderMarkers();
            const featureA = createMockFeature('A');

            mockMap.data._emit('click', buildClickEvent(featureA, 'ctrl'));

            expect(applyUpdater(onMultiSelectChange, [])).toEqual([featureA]);
        });

        it('removes a feature from the route selection when Cmd-clicked again', () => {
            const featureA = createMockFeature('A');
            const featureB = createMockFeature('B');
            const { mockMap, onMultiSelectChange } = renderMarkers({
                multiSelected: [featureA, featureB],
            });

            mockMap.data._emit('click', buildClickEvent(featureA, 'meta'));

            expect(applyUpdater(onMultiSelectChange, [featureA, featureB])).toEqual([featureB]);
        });

        it('promotes the currently single-selected marker into the set when extending', () => {
            const featureA = createMockFeature('A');
            const featureB = createMockFeature('B');
            const { mockMap, onMultiSelectChange, onFeatureSelect } = renderMarkers({
                selectedFeature: featureA,
            });

            mockMap.data._emit('click', buildClickEvent(featureB, 'meta'));

            expect(onFeatureSelect).toHaveBeenCalledWith(null);
            expect(applyUpdater(onMultiSelectChange, [])).toEqual([featureA, featureB]);
        });

        it('does not exceed the 9-station route selection cap', () => {
            const existing = Array.from({ length: 9 }, (_, i) => createMockFeature(`${i}`));
            const tenth = createMockFeature('10');
            const { mockMap, onMultiSelectChange } = renderMarkers({ multiSelected: existing });

            mockMap.data._emit('click', buildClickEvent(tenth, 'meta'));

            expect(applyUpdater(onMultiSelectChange, existing)).toEqual(existing);
        });

        it('clears the route selection on a plain click and falls back to single selection', () => {
            const featureA = createMockFeature('A');
            const featureB = createMockFeature('B');
            const { mockMap, onMultiSelectChange, onFeatureSelect } = renderMarkers({
                multiSelected: [featureA],
            });

            mockMap.data._emit('click', buildClickEvent(featureB));

            expect(applyUpdater(onMultiSelectChange, [featureA])).toEqual([]);
            expect(onFeatureSelect).toHaveBeenCalledWith(featureB);
        });

        it('clears the route selection on a plain double-click while still cycling style', () => {
            const featureA = createMockFeature('A');
            const featureB = createMockFeature('B');
            const { mockMap, onMultiSelectChange } = renderMarkers({
                multiSelected: [featureA, featureB],
            });

            mockMap.data._emit('dblclick', buildClickEvent(featureB));

            expect(applyUpdater(onMultiSelectChange, [featureA, featureB])).toEqual([]);
            expect(mockMap.data.overrideStyle).toHaveBeenCalledWith(
                featureB,
                expect.objectContaining({ icon: expect.any(String) }),
            );
        });

        it('clears the route selection on a plain right-click while still resetting style', () => {
            const featureA = createMockFeature('A');
            const featureB = createMockFeature('B');
            const { mockMap, onMultiSelectChange, onFeatureSelect } = renderMarkers({
                multiSelected: [featureA, featureB],
            });

            mockMap.data._emit('rightclick', buildClickEvent(featureB));

            expect(applyUpdater(onMultiSelectChange, [featureA, featureB])).toEqual([]);
            expect(onFeatureSelect).toHaveBeenCalledWith(null);
        });

        it('ignores Cmd + double-click', () => {
            const featureA = createMockFeature('A');
            const { mockMap, onMultiSelectChange } = renderMarkers({ multiSelected: [featureA] });
            (mockMap.data.overrideStyle as ReturnType<typeof vi.fn>).mockClear();

            mockMap.data._emit('dblclick', buildClickEvent(featureA, 'meta'));

            expect(onMultiSelectChange).not.toHaveBeenCalled();
            expect(mockMap.data.overrideStyle).not.toHaveBeenCalled();
        });

        it('ignores Cmd + right-click', () => {
            const featureA = createMockFeature('A');
            const { mockMap, onMultiSelectChange, onFeatureSelect } = renderMarkers({
                multiSelected: [featureA],
            });
            (mockMap.data.overrideStyle as ReturnType<typeof vi.fn>).mockClear();

            mockMap.data._emit('rightclick', buildClickEvent(featureA, 'meta'));

            expect(onMultiSelectChange).not.toHaveBeenCalled();
            expect(onFeatureSelect).not.toHaveBeenCalled();
            expect(mockMap.data.overrideStyle).not.toHaveBeenCalled();
        });
    });

    it('does not leave stale features when remounted after storage switch', () => {
        const mockMap = createMockMap();
        const mockFeatures = [createMockFeature('18786'), createMockFeature('18787')];
        mockMap.data._setFeatures(mockFeatures);

        const props = {
            map: mockMap,
            selectedFeature: null as google.maps.Data.Feature | null,
            onFeatureSelect: vi.fn(),
            multiSelected: [] as google.maps.Data.Feature[],
            onMultiSelectChange: vi.fn(),
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
