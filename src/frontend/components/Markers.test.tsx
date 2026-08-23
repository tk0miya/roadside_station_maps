/**
 * @vitest-environment jsdom
 */

import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createMockCustomPoint,
    createMockFeature,
    createMockLatLng,
    createMockMap,
    createMockStations,
    setupGoogleMapsMock,
} from '#test-utils/test-utils';
import { MARKER_ICONS } from '../marker-icons';
import { isCustomPoint, MAX_ROUTE_SELECTION } from '../route';
import { MemoryStorage } from '../storage/memory-storage';
import {
    applyMultiSelection,
    changeStyle,
    cycleRouteNumber,
    loadRoadStations,
    Markers,
    resetStyle,
    resolveMarkerClick,
} from './Markers';

const stations = createMockStations(3);

const buildClickEvent = (feature: google.maps.Data.Feature, modifier?: 'meta' | 'ctrl'): google.maps.Data.MouseEvent =>
    ({
        feature,
        domEvent: {
            metaKey: modifier === 'meta',
            ctrlKey: modifier === 'ctrl',
        } as unknown as MouseEvent,
    }) as google.maps.Data.MouseEvent;

const buildMapClickEvent = (modifier?: 'meta' | 'ctrl', lat = 36.5, lng = 140.5): google.maps.MapMouseEvent =>
    ({
        latLng: createMockLatLng(lat, lng),
        domEvent: {
            metaKey: modifier === 'meta',
            ctrlKey: modifier === 'ctrl',
        } as unknown as MouseEvent,
    }) as google.maps.MapMouseEvent;

describe('Markers', () => {
    const renderMarkers = (
        overrides: {
            multiSelected?: google.maps.Data.Feature[];
            selectedFeature?: google.maps.Data.Feature | null;
            routeMode?: boolean;
        } = {}
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
                routeMode={overrides.routeMode ?? false}
            />
        );
        return { mockMap, onMultiSelectChange, onFeatureSelect };
    };

    // Read back the selection a handler asked for, by running the updater it
    // handed to onMultiSelectChange against the selection it started from.
    const applyUpdater = (
        mock: ReturnType<typeof vi.fn>,
        prev: google.maps.Data.Feature[]
    ): google.maps.Data.Feature[] => {
        expect(mock).toHaveBeenCalledTimes(1);
        const updater = mock.mock.calls[0][0] as (p: google.maps.Data.Feature[]) => google.maps.Data.Feature[];
        return updater(prev);
    };

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
                routeMode={false}
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
                routeMode={false}
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
                routeMode={false}
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
                expect.objectContaining({ icon: expect.any(String) })
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

        it('swaps a numbered marker with the previous one on Cmd + right-click', () => {
            const featureA = createMockFeature('A');
            const featureB = createMockFeature('B');
            const featureC = createMockFeature('C');
            const { mockMap, onMultiSelectChange, onFeatureSelect } = renderMarkers({
                multiSelected: [featureA, featureB, featureC],
            });
            (mockMap.data.overrideStyle as ReturnType<typeof vi.fn>).mockClear();

            mockMap.data._emit('rightclick', buildClickEvent(featureC, 'meta'));

            expect(applyUpdater(onMultiSelectChange, [featureA, featureB, featureC])).toEqual([
                featureA,
                featureC,
                featureB,
            ]);
            expect(onFeatureSelect).not.toHaveBeenCalled();
            expect(mockMap.data.overrideStyle).not.toHaveBeenCalled();
        });

        it('leaves a custom route point alone on a plain double-click or right-click', () => {
            const point = createMockCustomPoint();
            const { mockMap, onMultiSelectChange, onFeatureSelect } = renderMarkers({ multiSelected: [point] });
            (mockMap.data.overrideStyle as ReturnType<typeof vi.fn>).mockClear();

            mockMap.data._emit('dblclick', buildClickEvent(point));
            mockMap.data._emit('rightclick', buildClickEvent(point));

            expect(onMultiSelectChange).not.toHaveBeenCalled();
            expect(onFeatureSelect).not.toHaveBeenCalled();
            expect(mockMap.data.overrideStyle).not.toHaveBeenCalled();
        });
    });

    describe('custom route points', () => {
        beforeEach(() => {
            setupGoogleMapsMock();
        });

        // The feature map.data.add() handed back for the double-click.
        const addedPoint = (mockMap: ReturnType<typeof createMockMap>) =>
            (mockMap.data.add as ReturnType<typeof vi.fn>).mock.results[0]?.value;

        it('adds a numbered point at the clicked coordinate on Ctrl + double-click', () => {
            const { mockMap, onMultiSelectChange } = renderMarkers();

            mockMap._emit('dblclick', buildMapClickEvent('ctrl', 36.5, 140.5));

            const point = addedPoint(mockMap);
            expect(isCustomPoint(point)).toBe(true);
            expect((point.getGeometry() as google.maps.Data.Point).get().lat()).toBe(36.5);
            expect(applyUpdater(onMultiSelectChange, [])).toEqual([point]);
        });

        it('numbers the point after the stations already chosen', () => {
            const featureA = createMockFeature('A');
            const featureB = createMockFeature('B');
            const { mockMap, onMultiSelectChange } = renderMarkers({ multiSelected: [featureA, featureB] });

            mockMap._emit('dblclick', buildMapClickEvent('ctrl'));

            expect(applyUpdater(onMultiSelectChange, [featureA, featureB])).toEqual([
                featureA,
                featureB,
                addedPoint(mockMap),
            ]);
        });

        it('lifts a single selection into the route ahead of the new point', () => {
            const featureA = createMockFeature('A');
            const { mockMap, onMultiSelectChange } = renderMarkers({ selectedFeature: featureA });

            mockMap._emit('dblclick', buildMapClickEvent('ctrl'));

            expect(applyUpdater(onMultiSelectChange, [])).toEqual([featureA, addedPoint(mockMap)]);
        });

        it('adds nothing on a double-click without the modifier', () => {
            const { mockMap, onMultiSelectChange } = renderMarkers();

            mockMap._emit('dblclick', buildMapClickEvent());

            expect(mockMap.data.add).not.toHaveBeenCalled();
            expect(onMultiSelectChange).not.toHaveBeenCalled();
        });

        it('adds no point once the route is full', () => {
            const full = Array.from({ length: MAX_ROUTE_SELECTION }, (_, i) => createMockFeature(`${i}`));
            const { mockMap, onMultiSelectChange } = renderMarkers({ multiSelected: full });

            mockMap._emit('dblclick', buildMapClickEvent('ctrl'));

            expect(mockMap.data.add).not.toHaveBeenCalled();
            expect(onMultiSelectChange).not.toHaveBeenCalled();
        });

        it('adds no second point where one already stands', () => {
            const point = createMockCustomPoint(36.5, 140.5);
            const { mockMap, onMultiSelectChange } = renderMarkers({ multiSelected: [point] });

            mockMap._emit('dblclick', buildMapClickEvent('ctrl', 36.5, 140.5));

            expect(mockMap.data.add).not.toHaveBeenCalled();
            expect(onMultiSelectChange).not.toHaveBeenCalled();
        });

        it('keeps the point when the click closes a drag of it', () => {
            const point = createMockCustomPoint();
            const { mockMap, onMultiSelectChange } = renderMarkers({ multiSelected: [point] });

            mockMap.data._emit('mousedown', buildClickEvent(point, 'ctrl'));
            mockMap.data._emit('setgeometry', { feature: point });
            mockMap.data._emit('click', buildClickEvent(point, 'ctrl'));

            expect(onMultiSelectChange).not.toHaveBeenCalled();

            // The press that starts the next gesture clears the drag.
            mockMap.data._emit('mousedown', buildClickEvent(point, 'ctrl'));
            mockMap.data._emit('click', buildClickEvent(point, 'ctrl'));

            expect(onMultiSelectChange).toHaveBeenCalledTimes(1);
        });

        it('stops the map from zooming while the modifier is held', () => {
            const { mockMap } = renderMarkers();

            fireEvent.keyDown(window, { key: 'Control', ctrlKey: true });
            expect(mockMap.setOptions).toHaveBeenLastCalledWith({ disableDoubleClickZoom: true });

            fireEvent.keyUp(window, { key: 'Control', ctrlKey: false });
            expect(mockMap.setOptions).toHaveBeenLastCalledWith({ disableDoubleClickZoom: false });
        });

        it('picks the modifier back up from a press when no keydown announced it', () => {
            const { mockMap } = renderMarkers();
            // The key went down while another window had focus.
            fireEvent.mouseDown(window, { ctrlKey: true });

            expect(mockMap.setOptions).toHaveBeenLastCalledWith({ disableDoubleClickZoom: true });
        });

        it('lets go of the modifier when the window loses focus', () => {
            const { mockMap } = renderMarkers();
            fireEvent.keyDown(window, { key: 'Control', ctrlKey: true });

            // The keyup lands in the other window, so only the blur says so.
            fireEvent.blur(window);

            expect(mockMap.setOptions).toHaveBeenLastCalledWith({ disableDoubleClickZoom: false });
        });
    });

    describe('route mode', () => {
        beforeEach(() => {
            setupGoogleMapsMock();
        });

        it('adds a plainly tapped marker to the route', () => {
            const featureA = createMockFeature('A');
            const featureB = createMockFeature('B');
            const { mockMap, onMultiSelectChange, onFeatureSelect } = renderMarkers({
                multiSelected: [featureA],
                routeMode: true,
            });

            mockMap.data._emit('click', buildClickEvent(featureB));

            expect(applyUpdater(onMultiSelectChange, [featureA])).toEqual([featureA, featureB]);
            expect(onFeatureSelect).toHaveBeenCalledWith(null);
        });

        it('takes a marker back out of the route when it is tapped again', () => {
            const featureA = createMockFeature('A');
            const featureB = createMockFeature('B');
            const { mockMap, onMultiSelectChange } = renderMarkers({
                multiSelected: [featureA, featureB],
                routeMode: true,
            });

            mockMap.data._emit('click', buildClickEvent(featureA));

            expect(applyUpdater(onMultiSelectChange, [featureA, featureB])).toEqual([featureB]);
        });

        it('leaves the visit styles alone on a double tap', () => {
            const featureA = createMockFeature('A');
            const { mockMap, onMultiSelectChange, onFeatureSelect } = renderMarkers({
                multiSelected: [featureA],
                routeMode: true,
            });
            (mockMap.data.overrideStyle as ReturnType<typeof vi.fn>).mockClear();

            mockMap.data._emit('dblclick', buildClickEvent(featureA));

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
            routeMode: false,
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
                routeMode: false,
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
                routeMode: false,
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
                routeMode: false,
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
                routeMode: false,
                selectedFeature: null,
                multiSelected: [a],
            });

            expect(result.multiSelected).toEqual([a, b]);
        });

        it('does not exceed the route-selection cap', () => {
            const existing = Array.from({ length: MAX_ROUTE_SELECTION }, (_, i) => createMockFeature(`${i}`));
            const extra = createMockFeature('extra');

            const result = resolveMarkerClick({
                clickedFeature: extra,
                modifierPressed: true,
                routeMode: false,
                selectedFeature: null,
                multiSelected: existing,
            });

            expect(result.multiSelected).toEqual(existing);
        });
    });

    describe('with a custom route point', () => {
        it('drops the point out of the route when modifier-clicked', () => {
            const a = createMockFeature('A');
            const point = createMockCustomPoint();

            const result = resolveMarkerClick({
                clickedFeature: point,
                modifierPressed: true,
                routeMode: false,
                selectedFeature: null,
                multiSelected: [a, point],
            });

            expect(result.multiSelected).toEqual([a]);
            expect(result.selectedFeature).toBeNull();
        });

        it('does nothing on a plain click, keeping the route intact', () => {
            const a = createMockFeature('A');
            const point = createMockCustomPoint();

            const result = resolveMarkerClick({
                clickedFeature: point,
                modifierPressed: false,
                routeMode: false,
                selectedFeature: null,
                multiSelected: [a, point],
            });

            expect(result).toEqual({});
        });
    });

    describe('with plain click', () => {
        it('clears the multi-selection and single-selects the clicked feature', () => {
            const a = createMockFeature('A');
            const b = createMockFeature('B');

            const result = resolveMarkerClick({
                clickedFeature: b,
                modifierPressed: false,
                routeMode: false,
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
                routeMode: false,
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
                routeMode: false,
                selectedFeature: a,
                multiSelected: [],
            });

            expect(result.selectedFeature).toBe(b);
            expect(result.cycleStyleOn).toBeUndefined();
            expect(result.multiSelected).toBeUndefined();
        });
    });
});

describe('cycleRouteNumber', () => {
    it('swaps a feature with the one numbered before it', () => {
        const a = createMockFeature('A');
        const b = createMockFeature('B');
        const c = createMockFeature('C');

        expect(cycleRouteNumber([a, b, c], c)).toEqual([a, c, b]);
    });

    it('wraps the first feature around to the end', () => {
        const a = createMockFeature('A');
        const b = createMockFeature('B');
        const c = createMockFeature('C');

        expect(cycleRouteNumber([a, b, c], a)).toEqual([b, c, a]);
    });

    it('returns the same array for a single-feature selection', () => {
        const a = createMockFeature('A');
        const multiSelected = [a];

        expect(cycleRouteNumber(multiSelected, a)).toBe(multiSelected);
    });

    it('returns the same array for a feature outside the selection', () => {
        const a = createMockFeature('A');
        const b = createMockFeature('B');
        const outsider = createMockFeature('C');
        const multiSelected = [a, b];

        expect(cycleRouteNumber(multiSelected, outsider)).toBe(multiSelected);
    });

    it('leaves the input untouched', () => {
        const a = createMockFeature('A');
        const b = createMockFeature('B');
        const multiSelected = [a, b];

        cycleRouteNumber(multiSelected, b);
        cycleRouteNumber(multiSelected, a);

        expect(multiSelected).toEqual([a, b]);
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
        onMarkerMouseDown: vi.fn(),
        onFeatureDragged: vi.fn(),
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
        mockMap.data._emit('mousedown', { feature } as unknown);
        mockMap.data._emit('setgeometry', { feature } as unknown);

        expect(handlers.onMarkerClick).toHaveBeenCalledTimes(1);
        expect(handlers.onMarkerDoubleClick).toHaveBeenCalledTimes(1);
        expect(handlers.onMarkerRightClick).toHaveBeenCalledTimes(1);
        expect(handlers.onMarkerMouseDown).toHaveBeenCalledTimes(1);
        expect(handlers.onFeatureDragged).toHaveBeenCalledTimes(1);

        cleanup();
    });

    it('registers a storage-driven style callback', () => {
        const mockMap = createMockMap();
        const storage = new MemoryStorage();
        storage.setItem('A', '2');

        loadRoadStations(mockMap, stations, storage, noopHandlers());

        const styleFor = (mockMap.data.setStyle as ReturnType<typeof vi.fn>).mock.calls[0][0] as (
            f: google.maps.Data.Feature
        ) => google.maps.Data.StyleOptions;
        expect(styleFor(createMockFeature('A'))).toEqual({ icon: MARKER_ICONS[2] });
        expect(styleFor(createMockFeature('B'))).toEqual({ icon: MARKER_ICONS[0] });
        // A custom route point has no stored style and waits for its number.
        expect(styleFor(createMockCustomPoint())).toEqual({ visible: false });
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
        mockMap.data._emit('mousedown', { feature } as unknown);
        mockMap.data._emit('setgeometry', { feature } as unknown);

        expect(handlers.onMarkerClick).not.toHaveBeenCalled();
        expect(handlers.onMarkerDoubleClick).not.toHaveBeenCalled();
        expect(handlers.onMarkerRightClick).not.toHaveBeenCalled();
        expect(handlers.onMarkerMouseDown).not.toHaveBeenCalled();
        expect(handlers.onFeatureDragged).not.toHaveBeenCalled();
    });

    it('cleanup removes every feature from the data layer', () => {
        const mockMap = createMockMap();
        const features = [createMockFeature('A'), createMockFeature('B')];
        mockMap.data._setFeatures(features);

        const cleanup = loadRoadStations(mockMap, stations, new MemoryStorage(), noopHandlers());

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

    it('reveals a custom point with its number and leaves it draggable', () => {
        const mockMap = createMockMap();
        const point = createMockCustomPoint();
        const storage = new MemoryStorage();

        applyMultiSelection(mockMap, [], [point], storage);

        expect(mockMap.data.overrideStyle).toHaveBeenCalledWith(point, {
            icon: expect.objectContaining({ url: expect.stringContaining('svg') }),
            visible: true,
            draggable: true,
        });
    });

    it('takes a custom point off the map when it leaves the selection', () => {
        const mockMap = createMockMap();
        const a = createMockFeature('A');
        const point = createMockCustomPoint();
        const storage = new MemoryStorage();

        applyMultiSelection(mockMap, [a, point], [a], storage);

        expect(mockMap.data.remove).toHaveBeenCalledWith(point);
        // The station keeps its marker; only its icon goes back to the stored one.
        expect(mockMap.data.remove).toHaveBeenCalledTimes(1);
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
        const numberedCalls = (mockMap.data.overrideStyle as ReturnType<typeof vi.fn>).mock.calls.filter(
            (call) => call[0] === b || call[0] === c
        );
        expect(numberedCalls).toHaveLength(2);
        expect(numberedCalls[0][0]).toBe(b);
        expect(numberedCalls[1][0]).toBe(c);
    });
});
