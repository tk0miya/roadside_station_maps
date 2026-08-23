/**
 * @vitest-environment jsdom
 */

import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createMockCustomStop,
    createMockFeature,
    createMockLatLng,
    createMockMap,
    createMockStations,
    setupGoogleMapsMock,
} from '#test-utils/test-utils';
import { MARKER_ICONS } from '../marker-icons';
import { isCustomStop, MAX_ROUTE_STOPS } from '../route';
import { MemoryStorage } from '../storage/memory-storage';
import type { MapMode } from '../types/station-map';
import {
    addCustomStopAt,
    changeStyle,
    cycleRouteNumber,
    drawStops,
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
    const renderMarkers = (overrides: { mode?: MapMode; selected?: google.maps.Data.Feature[] } = {}) => {
        const mockMap = createMockMap();
        const onSelectedChange = vi.fn();
        const onEnterRouteMode = vi.fn();
        render(
            <Markers
                map={mockMap}
                mode={overrides.mode ?? 'normal'}
                selected={overrides.selected ?? []}
                onSelectedChange={onSelectedChange}
                storage={new MemoryStorage()}
                stations={stations}
                onStyleChange={() => {}}
                onEnterRouteMode={onEnterRouteMode}
            />
        );
        return { mockMap, onSelectedChange, onEnterRouteMode };
    };

    // Read back the picks a handler asked for, by running the updater it handed
    // to onSelectedChange against the picks it started from.
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
                mode="normal"
                selected={[]}
                onSelectedChange={() => {}}
                storage={new MemoryStorage()}
                stations={stations}
                onStyleChange={() => {}}
                onEnterRouteMode={() => {}}
            />
        );
        expect(container.firstChild).toBeNull();
    });

    it('adds GeoJSON features on mount', () => {
        const mockMap = createMockMap();
        render(
            <Markers
                map={mockMap}
                mode="normal"
                selected={[]}
                onSelectedChange={() => {}}
                storage={new MemoryStorage()}
                stations={stations}
                onStyleChange={() => {}}
                onEnterRouteMode={() => {}}
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
                mode="normal"
                selected={[]}
                onSelectedChange={() => {}}
                storage={new MemoryStorage()}
                stations={stations}
                onStyleChange={() => {}}
                onEnterRouteMode={() => {}}
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
            const featureB = createMockFeature('B');
            const { mockMap, onSelectedChange } = renderMarkers();

            mockMap.data._emit('click', buildClickEvent(featureB));

            // Normal mode picks the one station whose details are open.
            expect(applyUpdater(onSelectedChange, [])).toEqual([featureB]);
        });

        it('cycles the style on a double-click', () => {
            const featureB = createMockFeature('B');
            const { mockMap } = renderMarkers();

            mockMap.data._emit('dblclick', buildClickEvent(featureB));

            expect(mockMap.data.overrideStyle).toHaveBeenCalledWith(
                featureB,
                expect.objectContaining({ icon: expect.any(String) })
            );
        });

        it('resets the style on a right-click', () => {
            const featureB = createMockFeature('B');
            const { mockMap, onSelectedChange } = renderMarkers({ selected: [featureB] });

            mockMap.data._emit('rightclick', buildClickEvent(featureB));

            // The station whose style was reset is put away with it.
            expect(applyUpdater(onSelectedChange, [featureB])).toEqual([]);
        });
    });

    describe('the way into route mode', () => {
        beforeEach(() => {
            setupGoogleMapsMock();
        });

        // The feature map.data.add() handed back for the double-click.
        const addedStop = (mockMap: ReturnType<typeof createMockMap>) =>
            (mockMap.data.add as ReturnType<typeof vi.fn>).mock.results[0]?.value;

        it('opens the mode with the station a Cmd + click landed on', () => {
            const featureA = createMockFeature('A');
            const { mockMap, onEnterRouteMode, onSelectedChange } = renderMarkers();

            mockMap.data._emit('click', buildClickEvent(featureA, 'meta'));

            expect(onEnterRouteMode).toHaveBeenCalledWith(featureA);
            // The way in owns the seed from here; the click itself picks nothing.
            expect(onSelectedChange).not.toHaveBeenCalled();
        });

        it('opens the mode with a custom stop where a Ctrl + double-click landed', () => {
            const { mockMap, onEnterRouteMode } = renderMarkers();

            mockMap._emit('dblclick', buildMapClickEvent('ctrl', 36.5, 140.5));

            const stop = addedStop(mockMap);
            expect(isCustomStop(stop)).toBe(true);
            expect((stop.getGeometry() as google.maps.Data.Point).get().lat()).toBe(36.5);
            expect(onEnterRouteMode).toHaveBeenCalledWith(stop);
        });

        it('opens nothing on a double-click without the modifier', () => {
            const { mockMap, onEnterRouteMode } = renderMarkers();

            mockMap._emit('dblclick', buildMapClickEvent());

            expect(mockMap.data.add).not.toHaveBeenCalled();
            expect(onEnterRouteMode).not.toHaveBeenCalled();
        });

        it('is not a way in once already inside: a Cmd + marker click is an ordinary route edit', () => {
            const featureA = createMockFeature('A');
            const { mockMap, onEnterRouteMode, onSelectedChange } = renderMarkers({ mode: 'route' });

            mockMap.data._emit('click', buildClickEvent(featureA, 'meta'));

            expect(onEnterRouteMode).not.toHaveBeenCalled();
            expect(applyUpdater(onSelectedChange, [])).toEqual([featureA]);
        });
    });

    describe('custom stops', () => {
        beforeEach(() => {
            setupGoogleMapsMock();
        });

        it('keeps the stop when the click closes a drag of it', () => {
            const stop = createMockCustomStop();
            const { mockMap, onSelectedChange } = renderMarkers({ mode: 'route', selected: [stop] });

            mockMap.data._emit('mousedown', buildClickEvent(stop));
            mockMap.data._emit('setgeometry', { feature: stop });
            mockMap.data._emit('click', buildClickEvent(stop));

            expect(onSelectedChange).not.toHaveBeenCalled();

            // The press that starts the next gesture clears the drag.
            mockMap.data._emit('mousedown', buildClickEvent(stop));
            mockMap.data._emit('click', buildClickEvent(stop));

            expect(onSelectedChange).toHaveBeenCalledTimes(1);
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

        // The gesture places a custom stop on both sides of the mode, so the
        // zoom stays off on both.
        it('stops the map from zooming inside route mode too', () => {
            const { mockMap } = renderMarkers({ mode: 'route' });

            fireEvent.keyDown(window, { key: 'Control', ctrlKey: true });

            expect(mockMap.setOptions).toHaveBeenLastCalledWith({ disableDoubleClickZoom: true });
        });

        it('adds a custom stop where a Cmd + double-click landed inside route mode', () => {
            const featureA = createMockFeature('A');
            const { mockMap, onSelectedChange, onEnterRouteMode } = renderMarkers({
                mode: 'route',
                selected: [featureA],
            });

            mockMap._emit('dblclick', buildMapClickEvent('meta', 36.5, 140.5));

            const stop = (mockMap.data.add as ReturnType<typeof vi.fn>).mock.results[0]?.value;
            expect(isCustomStop(stop)).toBe(true);
            expect((stop.getGeometry() as google.maps.Data.Point).get().lat()).toBe(36.5);
            expect(applyUpdater(onSelectedChange, [featureA])).toEqual([featureA, stop]);
            // Already inside; nothing reopens the mode.
            expect(onEnterRouteMode).not.toHaveBeenCalled();
        });

        it('leaves a full route alone on a Cmd + double-click', () => {
            const stops = Array.from({ length: MAX_ROUTE_STOPS }, (_, i) => createMockFeature(`S${i}`));
            const { mockMap, onSelectedChange } = renderMarkers({ mode: 'route', selected: stops });

            mockMap._emit('dblclick', buildMapClickEvent('meta'));

            expect(mockMap.data.add).not.toHaveBeenCalled();
            expect(onSelectedChange).not.toHaveBeenCalled();
        });

        it('leaves the double-click alone inside route mode without the modifier', () => {
            const { mockMap, onSelectedChange } = renderMarkers({ mode: 'route' });

            mockMap._emit('dblclick', buildMapClickEvent());

            expect(mockMap.data.add).not.toHaveBeenCalled();
            expect(onSelectedChange).not.toHaveBeenCalled();
        });
    });

    describe('route mode', () => {
        beforeEach(() => {
            setupGoogleMapsMock();
        });

        it('adds a plainly tapped marker to the route', () => {
            const featureA = createMockFeature('A');
            const featureB = createMockFeature('B');
            const { mockMap, onSelectedChange } = renderMarkers({ mode: 'route', selected: [featureA] });

            mockMap.data._emit('click', buildClickEvent(featureB));

            expect(applyUpdater(onSelectedChange, [featureA])).toEqual([featureA, featureB]);
        });

        it('takes a marker back out of the route when it is tapped again', () => {
            const featureA = createMockFeature('A');
            const featureB = createMockFeature('B');
            const { mockMap, onSelectedChange } = renderMarkers({ mode: 'route', selected: [featureA, featureB] });

            mockMap.data._emit('click', buildClickEvent(featureA));

            expect(applyUpdater(onSelectedChange, [featureA, featureB])).toEqual([featureB]);
        });

        it('leaves the visit styles alone on a double tap', () => {
            const featureA = createMockFeature('A');
            const { mockMap, onSelectedChange } = renderMarkers({ mode: 'route', selected: [featureA] });
            (mockMap.data.overrideStyle as ReturnType<typeof vi.fn>).mockClear();

            mockMap.data._emit('dblclick', buildClickEvent(featureA));

            expect(onSelectedChange).not.toHaveBeenCalled();
            expect(mockMap.data.overrideStyle).not.toHaveBeenCalled();
        });

        it('swaps a numbered marker with the previous one on a right-click', () => {
            const featureA = createMockFeature('A');
            const featureB = createMockFeature('B');
            const featureC = createMockFeature('C');
            const { mockMap, onSelectedChange } = renderMarkers({
                mode: 'route',
                selected: [featureA, featureB, featureC],
            });
            (mockMap.data.overrideStyle as ReturnType<typeof vi.fn>).mockClear();

            mockMap.data._emit('rightclick', buildClickEvent(featureC));

            expect(applyUpdater(onSelectedChange, [featureA, featureB, featureC])).toEqual([
                featureA,
                featureC,
                featureB,
            ]);
            // Reordering is not a visit-style change.
            expect(mockMap.data.overrideStyle).not.toHaveBeenCalled();
        });

        it('takes no more stops once the route is full', () => {
            const full = Array.from({ length: MAX_ROUTE_STOPS }, (_, i) => createMockFeature(`${i}`));
            const extra = createMockFeature('extra');
            const { mockMap, onSelectedChange } = renderMarkers({ mode: 'route', selected: full });

            mockMap.data._emit('click', buildClickEvent(extra));

            expect(onSelectedChange).not.toHaveBeenCalled();
        });
    });

    // What the map is told to draw is derived from the mode, not read off
    // `selected`. The first of these holds that leaving the mode reaches the map
    // as a change to apply rather than a redraw to skip; the second holds the
    // derivation itself, since `selected` on its own would number a station
    // whose details were merely opened.
    describe('what the map is told to draw', () => {
        beforeEach(() => {
            setupGoogleMapsMock();
        });

        it('takes the route off the map when route mode is left', () => {
            const mockMap = createMockMap();
            const station = createMockFeature('A');
            const stop = createMockCustomStop();
            const props = {
                map: mockMap,
                onSelectedChange: () => {},
                storage: new MemoryStorage(),
                stations,
                onStyleChange: () => {},
                onEnterRouteMode: () => {},
            };

            const { rerender } = render(<Markers {...props} mode="route" selected={[station, stop]} />);
            (mockMap.data.overrideStyle as ReturnType<typeof vi.fn>).mockClear();

            rerender(<Markers {...props} mode="normal" selected={[]} />);

            // The custom stop leaves the map, and the station takes its stored
            // icon back in place of its number.
            expect(mockMap.data.remove).toHaveBeenCalledWith(stop);
            expect(mockMap.data.overrideStyle).toHaveBeenCalledWith(station, { icon: MARKER_ICONS[0] });
        });

        it('numbers nothing in normal mode: a station opened there is not a stop', () => {
            const mockMap = createMockMap();
            const station = createMockFeature('A');
            const props = {
                map: mockMap,
                mode: 'normal' as MapMode,
                onSelectedChange: () => {},
                storage: new MemoryStorage(),
                stations,
                onStyleChange: () => {},
                onEnterRouteMode: () => {},
            };

            const { rerender } = render(<Markers {...props} selected={[]} />);
            (mockMap.data.overrideStyle as ReturnType<typeof vi.fn>).mockClear();

            rerender(<Markers {...props} selected={[station]} />);

            expect(mockMap.data.overrideStyle).not.toHaveBeenCalled();
        });
    });

    it('does not leave stale features when remounted after storage switch', () => {
        const mockMap = createMockMap();
        const mockFeatures = [createMockFeature('18786'), createMockFeature('18787')];
        mockMap.data._setFeatures(mockFeatures);

        const props = {
            map: mockMap,
            mode: 'normal' as MapMode,
            selected: [] as google.maps.Data.Feature[],
            onSelectedChange: vi.fn(),
            storage: new MemoryStorage(),
            stations,
            onStyleChange: vi.fn(),
            onEnterRouteMode: vi.fn(),
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
    describe('in route mode', () => {
        it('appends a new feature to the route under the cap', () => {
            const a = createMockFeature('A');
            const b = createMockFeature('B');

            const result = resolveMarkerClick('route', [a], b);

            expect(result.selected).toEqual([a, b]);
            expect(result.cycleStyleOn).toBeUndefined();
        });

        it('toggles a feature out of the route when already present', () => {
            const a = createMockFeature('A');
            const b = createMockFeature('B');

            const result = resolveMarkerClick('route', [a, b], a);

            expect(result.selected).toEqual([b]);
        });

        it('takes a custom stop back out the same way a station goes', () => {
            const a = createMockFeature('A');
            const stop = createMockCustomStop();

            const result = resolveMarkerClick('route', [a, stop], stop);

            expect(result.selected).toEqual([a]);
        });

        it('leaves a full route untouched', () => {
            const existing = Array.from({ length: MAX_ROUTE_STOPS }, (_, i) => createMockFeature(`${i}`));
            const extra = createMockFeature('extra');

            const result = resolveMarkerClick('route', existing, extra);

            expect(result).toEqual({});
        });
    });

    describe('in normal mode', () => {
        it('opens the clicked feature', () => {
            const b = createMockFeature('B');

            const result = resolveMarkerClick('normal', [], b);

            expect(result.selected).toEqual([b]);
            expect(result.cycleStyleOn).toBeUndefined();
        });

        it('cycles the style when re-clicking the feature already open', () => {
            const a = createMockFeature('A');

            const result = resolveMarkerClick('normal', [a], a);

            expect(result.cycleStyleOn).toBe(a);
            expect(result.selected).toBeUndefined();
        });

        it('opens a different feature without touching style', () => {
            const a = createMockFeature('A');
            const b = createMockFeature('B');

            const result = resolveMarkerClick('normal', [a], b);

            expect(result.selected).toEqual([b]);
            expect(result.cycleStyleOn).toBeUndefined();
        });
    });
});

describe('addCustomStopAt', () => {
    beforeEach(() => {
        setupGoogleMapsMock();
    });

    it('puts a custom stop at the position, on the end of the stops already chosen', () => {
        const mockMap = createMockMap();
        const a = createMockFeature('A');

        const result = addCustomStopAt(mockMap, [a], createMockLatLng(36.5, 140.5));

        const stop = (mockMap.data.add as ReturnType<typeof vi.fn>).mock.results[0]?.value;
        expect(isCustomStop(stop)).toBe(true);
        expect(result).toEqual([a, stop]);
    });

    it('refuses once the route is full, leaving no marker behind', () => {
        const mockMap = createMockMap();
        const full = Array.from({ length: MAX_ROUTE_STOPS }, (_, i) => createMockFeature(`${i}`));

        expect(addCustomStopAt(mockMap, full, createMockLatLng(36.5, 140.5))).toBeNull();
        expect(mockMap.data.add).not.toHaveBeenCalled();
    });

    it('refuses a second custom stop where one already stands', () => {
        const mockMap = createMockMap();
        const stop = createMockCustomStop(36.5, 140.5);

        expect(addCustomStopAt(mockMap, [stop], createMockLatLng(36.5, 140.5))).toBeNull();
        expect(mockMap.data.add).not.toHaveBeenCalled();
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

    it('returns the same array for a single-stop route', () => {
        const a = createMockFeature('A');
        const stops = [a];

        expect(cycleRouteNumber(stops, a)).toBe(stops);
    });

    it('returns the same array for a feature outside the route', () => {
        const a = createMockFeature('A');
        const b = createMockFeature('B');
        const outsider = createMockFeature('C');
        const stops = [a, b];

        expect(cycleRouteNumber(stops, outsider)).toBe(stops);
    });

    it('leaves the input untouched', () => {
        const a = createMockFeature('A');
        const b = createMockFeature('B');
        const stops = [a, b];

        cycleRouteNumber(stops, b);
        cycleRouteNumber(stops, a);

        expect(stops).toEqual([a, b]);
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
        // A custom stop has no stored style and waits for its number.
        expect(styleFor(createMockCustomStop())).toEqual({ visible: false });
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

describe('drawStops', () => {
    beforeEach(() => {
        setupGoogleMapsMock();
    });

    it('numbers each feature in `next` by 1-based position', () => {
        const mockMap = createMockMap();
        const a = createMockFeature('A');
        const b = createMockFeature('B');
        const storage = new MemoryStorage();

        drawStops(mockMap, [], [a, b], storage);

        const calls = (mockMap.data.overrideStyle as ReturnType<typeof vi.fn>).mock.calls;
        expect(calls).toHaveLength(2);
        expect(calls[0][0]).toBe(a);
        expect(calls[0][1].icon).toMatchObject({ url: expect.stringContaining('svg') });
        expect(calls[1][0]).toBe(b);
    });

    it('restores storage-driven icons for features that are no longer stops', () => {
        const mockMap = createMockMap();
        const a = createMockFeature('A');
        const b = createMockFeature('B');
        const storage = new MemoryStorage();
        storage.setItem('A', '2');

        drawStops(mockMap, [a, b], [], storage);

        expect(mockMap.data.overrideStyle).toHaveBeenCalledWith(a, {
            icon: MARKER_ICONS[2],
        });
        expect(mockMap.data.overrideStyle).toHaveBeenCalledWith(b, {
            icon: MARKER_ICONS[0],
        });
    });

    it('reveals a custom stop with its number and leaves it draggable', () => {
        const mockMap = createMockMap();
        const stop = createMockCustomStop();
        const storage = new MemoryStorage();

        drawStops(mockMap, [], [stop], storage);

        expect(mockMap.data.overrideStyle).toHaveBeenCalledWith(stop, {
            icon: expect.objectContaining({ url: expect.stringContaining('svg') }),
            visible: true,
            draggable: true,
        });
    });

    it('takes a custom stop off the map when it leaves the route', () => {
        const mockMap = createMockMap();
        const a = createMockFeature('A');
        const stop = createMockCustomStop();
        const storage = new MemoryStorage();

        drawStops(mockMap, [a, stop], [a], storage);

        expect(mockMap.data.remove).toHaveBeenCalledWith(stop);
        // The station keeps its marker; only its icon goes back to the stored one.
        expect(mockMap.data.remove).toHaveBeenCalledTimes(1);
    });

    it('only re-numbers features that are still stops while resetting the rest', () => {
        const mockMap = createMockMap();
        const a = createMockFeature('A');
        const b = createMockFeature('B');
        const c = createMockFeature('C');
        const storage = new MemoryStorage();

        drawStops(mockMap, [a, b], [b, c], storage);

        // `a` is no longer a stop → restored to default icon
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
