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
import type { MapMode } from '../types/station-map';
import {
    applyMultiSelection,
    changeStyle,
    cycleRouteNumber,
    dropRoutePoint,
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
        const addedPoint = (mockMap: ReturnType<typeof createMockMap>) =>
            (mockMap.data.add as ReturnType<typeof vi.fn>).mock.results[0]?.value;

        it('opens the mode with the station a Cmd + click landed on', () => {
            const featureA = createMockFeature('A');
            const { mockMap, onEnterRouteMode, onSelectedChange } = renderMarkers();

            mockMap.data._emit('click', buildClickEvent(featureA, 'meta'));

            expect(onEnterRouteMode).toHaveBeenCalledWith(featureA);
            // The way in owns the seed from here; the click itself picks nothing.
            expect(onSelectedChange).not.toHaveBeenCalled();
        });

        it('opens the mode with a point where a Ctrl + double-click landed', () => {
            const { mockMap, onEnterRouteMode } = renderMarkers();

            mockMap._emit('dblclick', buildMapClickEvent('ctrl', 36.5, 140.5));

            const point = addedPoint(mockMap);
            expect(isCustomPoint(point)).toBe(true);
            expect((point.getGeometry() as google.maps.Data.Point).get().lat()).toBe(36.5);
            expect(onEnterRouteMode).toHaveBeenCalledWith(point);
        });

        it('opens nothing on a double-click without the modifier', () => {
            const { mockMap, onEnterRouteMode } = renderMarkers();

            mockMap._emit('dblclick', buildMapClickEvent());

            expect(mockMap.data.add).not.toHaveBeenCalled();
            expect(onEnterRouteMode).not.toHaveBeenCalled();
        });

        it('is not a way in once already inside: the modifier is not read there', () => {
            const featureA = createMockFeature('A');
            const { mockMap, onEnterRouteMode, onSelectedChange } = renderMarkers({ mode: 'route' });

            mockMap.data._emit('click', buildClickEvent(featureA, 'meta'));
            mockMap._emit('dblclick', buildMapClickEvent('ctrl'));

            expect(onEnterRouteMode).not.toHaveBeenCalled();
            expect(mockMap.data.add).not.toHaveBeenCalled();
            // The marker click is an ordinary route edit, modifier or not.
            expect(applyUpdater(onSelectedChange, [])).toEqual([featureA]);
        });
    });

    describe('custom route points', () => {
        beforeEach(() => {
            setupGoogleMapsMock();
        });

        it('keeps the point when the click closes a drag of it', () => {
            const point = createMockCustomPoint();
            const { mockMap, onSelectedChange } = renderMarkers({ mode: 'route', selected: [point] });

            mockMap.data._emit('mousedown', buildClickEvent(point));
            mockMap.data._emit('setgeometry', { feature: point });
            mockMap.data._emit('click', buildClickEvent(point));

            expect(onSelectedChange).not.toHaveBeenCalled();

            // The press that starts the next gesture clears the drag.
            mockMap.data._emit('mousedown', buildClickEvent(point));
            mockMap.data._emit('click', buildClickEvent(point));

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

        it('leaves the map its double-click zoom inside route mode', () => {
            const { mockMap } = renderMarkers({ mode: 'route' });

            fireEvent.keyDown(window, { key: 'Control', ctrlKey: true });

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
            const full = Array.from({ length: MAX_ROUTE_SELECTION }, (_, i) => createMockFeature(`${i}`));
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
            const point = createMockCustomPoint();
            const props = {
                map: mockMap,
                onSelectedChange: () => {},
                storage: new MemoryStorage(),
                stations,
                onStyleChange: () => {},
                onEnterRouteMode: () => {},
            };

            const { rerender } = render(<Markers {...props} mode="route" selected={[station, point]} />);
            (mockMap.data.overrideStyle as ReturnType<typeof vi.fn>).mockClear();

            rerender(<Markers {...props} mode="normal" selected={[]} />);

            // The dropped point leaves the map, and the station takes its stored
            // icon back in place of its number.
            expect(mockMap.data.remove).toHaveBeenCalledWith(point);
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

        it('takes a custom point back out the same way a station goes', () => {
            const a = createMockFeature('A');
            const point = createMockCustomPoint();

            const result = resolveMarkerClick('route', [a, point], point);

            expect(result.selected).toEqual([a]);
        });

        it('leaves a full route untouched', () => {
            const existing = Array.from({ length: MAX_ROUTE_SELECTION }, (_, i) => createMockFeature(`${i}`));
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

describe('dropRoutePoint', () => {
    beforeEach(() => {
        setupGoogleMapsMock();
    });

    it('puts a point at the position and numbers it after the stops already chosen', () => {
        const mockMap = createMockMap();
        const a = createMockFeature('A');

        const result = dropRoutePoint(mockMap, createMockLatLng(36.5, 140.5), [a]);

        const point = (mockMap.data.add as ReturnType<typeof vi.fn>).mock.results[0]?.value;
        expect(isCustomPoint(point)).toBe(true);
        expect(result).toEqual([a, point]);
    });

    it('refuses once the route is full, leaving no marker behind', () => {
        const mockMap = createMockMap();
        const full = Array.from({ length: MAX_ROUTE_SELECTION }, (_, i) => createMockFeature(`${i}`));

        expect(dropRoutePoint(mockMap, createMockLatLng(36.5, 140.5), full)).toBeNull();
        expect(mockMap.data.add).not.toHaveBeenCalled();
    });

    it('refuses a second point where one already stands', () => {
        const mockMap = createMockMap();
        const point = createMockCustomPoint(36.5, 140.5);

        expect(dropRoutePoint(mockMap, createMockLatLng(36.5, 140.5), [point])).toBeNull();
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
