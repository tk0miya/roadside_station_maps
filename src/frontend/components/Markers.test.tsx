/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import {
    applyMultiSelection,
    changeStyle,
    loadRoadStations,
    MAX_ROUTE_SELECTION,
    Markers,
    resetStyle,
    resolveMarkerClick,
} from './Markers';
import {
    createMockFeature,
    createMockMap,
    createMockStations,
    setupGoogleMapsMock,
} from '@test-utils/test-utils';
import { MARKER_ICONS } from '../marker-icons';
import { MemoryStorage } from '../storage/memory-storage';

const stations = createMockStations(3);

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

    describe('click handlers', () => {
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

        // The branching logic itself is covered by the resolveMarkerClick
        // suite below. This single case exercises the glue layer:
        // the resolved intent must flow through the props correctly.
        it('dispatches the resolved click intent through props', () => {
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

describe('resolveMarkerClick', () => {
    describe('with modifier pressed', () => {
        it('promotes the single selection into the route set when extending with a different feature', () => {
            const a = createMockFeature('A');
            const b = createMockFeature('B');

            const result = resolveMarkerClick({
                clickedFeature: b,
                modifierPressed: true,
                selectedFeature: a,
                multiSelected: [],
            });

            expect(result.selectedFeature).toBeNull();
            expect(result.multiSelected).toEqual([a, b]);
            expect(result.cycleStyleOn).toBeUndefined();
        });

        it('keeps only the selected feature when modifier-clicking the same one', () => {
            const a = createMockFeature('A');

            const result = resolveMarkerClick({
                clickedFeature: a,
                modifierPressed: true,
                selectedFeature: a,
                multiSelected: [],
            });

            expect(result.selectedFeature).toBeNull();
            expect(result.multiSelected).toEqual([a]);
        });

        it('toggles a feature out of the route set when already present', () => {
            const a = createMockFeature('A');
            const b = createMockFeature('B');

            const result = resolveMarkerClick({
                clickedFeature: a,
                modifierPressed: true,
                selectedFeature: null,
                multiSelected: [a, b],
            });

            expect(result.multiSelected).toEqual([b]);
            expect(result.selectedFeature).toBeNull();
        });

        it('appends a new feature to the route set under the cap', () => {
            const a = createMockFeature('A');
            const b = createMockFeature('B');

            const result = resolveMarkerClick({
                clickedFeature: b,
                modifierPressed: true,
                selectedFeature: null,
                multiSelected: [a],
            });

            expect(result.multiSelected).toEqual([a, b]);
        });

        it('does not exceed the route-selection cap', () => {
            const existing = Array.from({ length: MAX_ROUTE_SELECTION }, (_, i) =>
                createMockFeature(`${i}`),
            );
            const extra = createMockFeature('extra');

            const result = resolveMarkerClick({
                clickedFeature: extra,
                modifierPressed: true,
                selectedFeature: null,
                multiSelected: existing,
            });

            expect(result.multiSelected).toEqual(existing);
        });
    });

    describe('with plain click', () => {
        it('clears the multi-selection and single-selects the clicked feature', () => {
            const a = createMockFeature('A');
            const b = createMockFeature('B');

            const result = resolveMarkerClick({
                clickedFeature: b,
                modifierPressed: false,
                selectedFeature: null,
                multiSelected: [a],
            });

            expect(result.multiSelected).toEqual([]);
            expect(result.selectedFeature).toBe(b);
            expect(result.cycleStyleOn).toBeUndefined();
        });

        it('cycles the style when re-clicking the currently selected feature', () => {
            const a = createMockFeature('A');

            const result = resolveMarkerClick({
                clickedFeature: a,
                modifierPressed: false,
                selectedFeature: a,
                multiSelected: [],
            });

            expect(result.cycleStyleOn).toBe(a);
            expect(result.selectedFeature).toBeUndefined();
            expect(result.multiSelected).toBeUndefined();
        });

        it('single-selects a different feature without touching style', () => {
            const a = createMockFeature('A');
            const b = createMockFeature('B');

            const result = resolveMarkerClick({
                clickedFeature: b,
                modifierPressed: false,
                selectedFeature: a,
                multiSelected: [],
            });

            expect(result.selectedFeature).toBe(b);
            expect(result.cycleStyleOn).toBeUndefined();
            expect(result.multiSelected).toBeUndefined();
        });
    });
});

describe('changeStyle', () => {
    it('advances the stored style id and applies the matching icon', () => {
        const mockMap = createMockMap();
        const feature = createMockFeature('18786');
        const storage = new MemoryStorage();

        changeStyle(mockMap, feature, storage);

        expect(storage.getItem('18786')).toBe('1');
        expect(mockMap.data.overrideStyle).toHaveBeenCalledWith(feature, {
            icon: MARKER_ICONS[1],
        });
    });

    it('wraps around to 0 once the maximum style id is reached', () => {
        const mockMap = createMockMap();
        const feature = createMockFeature('18786');
        const storage = new MemoryStorage();
        storage.setItem('18786', String(MARKER_ICONS.length - 1));

        changeStyle(mockMap, feature, storage);

        expect(storage.getItem('18786')).toBeNull();
        expect(mockMap.data.overrideStyle).toHaveBeenCalledWith(feature, {
            icon: MARKER_ICONS[0],
        });
    });
});

describe('resetStyle', () => {
    it('clears the stored style id and applies the default icon', () => {
        const mockMap = createMockMap();
        const feature = createMockFeature('18786');
        const storage = new MemoryStorage();
        storage.setItem('18786', '3');

        resetStyle(mockMap, feature, storage);

        expect(storage.getItem('18786')).toBeNull();
        expect(mockMap.data.overrideStyle).toHaveBeenCalledWith(feature, {
            icon: MARKER_ICONS[0],
        });
    });
});

describe('loadRoadStations', () => {
    const noopHandlers = () => ({
        onMarkerClick: vi.fn(),
        onMarkerDoubleClick: vi.fn(),
        onMarkerRightClick: vi.fn(),
    });

    it('adds the GeoJSON and dispatches click events through the handlers', () => {
        const mockMap = createMockMap();
        const handlers = noopHandlers();

        const cleanup = loadRoadStations(mockMap, stations, new MemoryStorage(), handlers);

        expect(mockMap.data.addGeoJson).toHaveBeenCalledWith(stations);

        const feature = createMockFeature('A');
        mockMap.data._emit('click', { feature } as unknown);
        mockMap.data._emit('dblclick', { feature } as unknown);
        mockMap.data._emit('rightclick', { feature } as unknown);

        expect(handlers.onMarkerClick).toHaveBeenCalledTimes(1);
        expect(handlers.onMarkerDoubleClick).toHaveBeenCalledTimes(1);
        expect(handlers.onMarkerRightClick).toHaveBeenCalledTimes(1);

        cleanup();
    });

    it('registers a storage-driven style callback', () => {
        const mockMap = createMockMap();
        const storage = new MemoryStorage();
        storage.setItem('A', '2');

        loadRoadStations(mockMap, stations, storage, noopHandlers());

        const styleFor = (mockMap.data.setStyle as ReturnType<typeof vi.fn>).mock.calls[0][0] as (
            f: google.maps.Data.Feature,
        ) => google.maps.Data.StyleOptions;
        expect(styleFor(createMockFeature('A'))).toEqual({ icon: MARKER_ICONS[2] });
        expect(styleFor(createMockFeature('B'))).toEqual({ icon: MARKER_ICONS[0] });
    });

    it('cleanup detaches every listener so subsequent events are ignored', () => {
        const mockMap = createMockMap();
        const handlers = noopHandlers();

        const cleanup = loadRoadStations(mockMap, stations, new MemoryStorage(), handlers);
        cleanup();

        const feature = createMockFeature('A');
        mockMap.data._emit('click', { feature } as unknown);
        mockMap.data._emit('dblclick', { feature } as unknown);
        mockMap.data._emit('rightclick', { feature } as unknown);

        expect(handlers.onMarkerClick).not.toHaveBeenCalled();
        expect(handlers.onMarkerDoubleClick).not.toHaveBeenCalled();
        expect(handlers.onMarkerRightClick).not.toHaveBeenCalled();
    });

    it('cleanup removes every feature from the data layer', () => {
        const mockMap = createMockMap();
        const features = [createMockFeature('A'), createMockFeature('B')];
        mockMap.data._setFeatures(features);

        const cleanup = loadRoadStations(
            mockMap,
            stations,
            new MemoryStorage(),
            noopHandlers(),
        );

        cleanup();

        expect(mockMap.data.remove).toHaveBeenCalledTimes(features.length);
        for (const feature of features) {
            expect(mockMap.data.remove).toHaveBeenCalledWith(feature);
        }
    });
});

describe('applyMultiSelection', () => {
    beforeEach(() => {
        setupGoogleMapsMock();
    });

    it('numbers each feature in `next` by 1-based position', () => {
        const mockMap = createMockMap();
        const a = createMockFeature('A');
        const b = createMockFeature('B');
        const storage = new MemoryStorage();

        applyMultiSelection(mockMap, [], [a, b], storage);

        const calls = (mockMap.data.overrideStyle as ReturnType<typeof vi.fn>).mock.calls;
        expect(calls).toHaveLength(2);
        expect(calls[0][0]).toBe(a);
        expect(calls[0][1].icon).toMatchObject({ url: expect.stringContaining('svg') });
        expect(calls[1][0]).toBe(b);
    });

    it('restores storage-driven icons for features dropped from the selection', () => {
        const mockMap = createMockMap();
        const a = createMockFeature('A');
        const b = createMockFeature('B');
        const storage = new MemoryStorage();
        storage.setItem('A', '2');

        applyMultiSelection(mockMap, [a, b], [], storage);

        expect(mockMap.data.overrideStyle).toHaveBeenCalledWith(a, {
            icon: MARKER_ICONS[2],
        });
        expect(mockMap.data.overrideStyle).toHaveBeenCalledWith(b, {
            icon: MARKER_ICONS[0],
        });
    });

    it('only re-numbers features still in the selection while resetting the rest', () => {
        const mockMap = createMockMap();
        const a = createMockFeature('A');
        const b = createMockFeature('B');
        const c = createMockFeature('C');
        const storage = new MemoryStorage();

        applyMultiSelection(mockMap, [a, b], [b, c], storage);

        // `a` was deselected → restored to default icon
        expect(mockMap.data.overrideStyle).toHaveBeenCalledWith(a, {
            icon: MARKER_ICONS[0],
        });
        // `b` and `c` get numbered icons (1, 2)
        const numberedCalls = (mockMap.data.overrideStyle as ReturnType<typeof vi.fn>).mock.calls
            .filter((call) => call[0] === b || call[0] === c);
        expect(numberedCalls).toHaveLength(2);
        expect(numberedCalls[0][0]).toBe(b);
        expect(numberedCalls[1][0]).toBe(c);
    });
});
