/**
 * @vitest-environment jsdom
 */

import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createMockCustomStop,
    createMockFeature,
    createMockMap,
    createMockStations,
    setupGoogleMapsMock,
} from '#test-utils/test-utils';
import type { DataMouseEvent, Feature, StyleOptions } from '../google-maps-types';
import { MARKER_ICONS } from '../marker-icons';
import { MAX_ROUTE_STOPS } from '../route';
import { MemoryStorage } from '../storage/memory-storage';
import type { MapMode } from '../types/station-map';
import { changeStyle, loadRoadStations, Markers, resetStyle, toggleRouteStop } from './Markers';

const stations = createMockStations(3);

const buildClickEvent = (feature: Feature, modifier?: 'meta' | 'ctrl'): DataMouseEvent =>
    ({
        feature,
        domEvent: {
            metaKey: modifier === 'meta',
            ctrlKey: modifier === 'ctrl',
        } as unknown as MouseEvent,
    }) as DataMouseEvent;

describe('Markers', () => {
    const renderMarkers = (overrides: { mode?: MapMode; selectedStops?: Feature[] } = {}) => {
        const mockMap = createMockMap();
        const onSelectedStopsChange = vi.fn();
        const onEnterRouteMode = vi.fn();
        render(
            <Markers
                map={mockMap}
                mode={overrides.mode ?? 'normal'}
                selectedStops={overrides.selectedStops ?? []}
                onSelectedStopsChange={onSelectedStopsChange}
                storage={new MemoryStorage()}
                stations={stations}
                onStyleChange={() => {}}
                onEnterRouteMode={onEnterRouteMode}
            />
        );
        return { mockMap, onSelectedStopsChange, onEnterRouteMode };
    };

    it('renders nothing to the DOM', () => {
        const mockMap = createMockMap();
        const { container } = render(
            <Markers
                map={mockMap}
                mode="normal"
                selectedStops={[]}
                onSelectedStopsChange={() => {}}
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
                selectedStops={[]}
                onSelectedStopsChange={() => {}}
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
                selectedStops={[]}
                onSelectedStopsChange={() => {}}
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

        // The route-mode branching is covered by the toggleRouteStop suite
        // below. This single case exercises the glue layer: a normal-mode
        // click must reach props with the clicked feature.
        it('dispatches the resolved click intent through props', () => {
            const featureB = createMockFeature('B');
            const { mockMap, onSelectedStopsChange } = renderMarkers();

            mockMap.data._emit('click', buildClickEvent(featureB));

            // Normal mode picks the one station whose details are open.
            expect(onSelectedStopsChange).toHaveBeenCalledWith([featureB]);
        });

        it('cycles the style instead of reselecting when the open feature is clicked again', () => {
            const featureB = createMockFeature('B');
            const { mockMap, onSelectedStopsChange } = renderMarkers({ selectedStops: [featureB] });

            mockMap.data._emit('click', buildClickEvent(featureB));

            expect(mockMap.data.overrideStyle).toHaveBeenCalledWith(
                featureB,
                expect.objectContaining({ icon: expect.any(String) })
            );
            expect(onSelectedStopsChange).not.toHaveBeenCalled();
        });

        it('opens a different feature without touching style when another is already open', () => {
            const featureA = createMockFeature('A');
            const featureB = createMockFeature('B');
            const { mockMap, onSelectedStopsChange } = renderMarkers({ selectedStops: [featureA] });

            mockMap.data._emit('click', buildClickEvent(featureB));

            expect(onSelectedStopsChange).toHaveBeenCalledWith([featureB]);
            expect(mockMap.data.overrideStyle).not.toHaveBeenCalled();
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
            const { mockMap, onSelectedStopsChange } = renderMarkers({ selectedStops: [featureB] });

            mockMap.data._emit('rightclick', buildClickEvent(featureB));

            // The station whose style was reset is put away with it.
            expect(onSelectedStopsChange).toHaveBeenCalledWith([]);
        });
    });

    describe('the way into route mode', () => {
        beforeEach(() => {
            setupGoogleMapsMock();
        });

        it('opens the mode with the station a Cmd + click landed on', () => {
            const featureA = createMockFeature('A');
            const { mockMap, onEnterRouteMode, onSelectedStopsChange } = renderMarkers();

            mockMap.data._emit('click', buildClickEvent(featureA, 'meta'));

            expect(onEnterRouteMode).toHaveBeenCalledWith(featureA);
            // The way in owns the seed from here; the click itself picks nothing.
            expect(onSelectedStopsChange).not.toHaveBeenCalled();
        });

        it('is not a way in once already inside: a Cmd + marker click is an ordinary route edit', () => {
            const featureA = createMockFeature('A');
            const { mockMap, onEnterRouteMode, onSelectedStopsChange } = renderMarkers({ mode: 'route' });

            mockMap.data._emit('click', buildClickEvent(featureA, 'meta'));

            expect(onEnterRouteMode).not.toHaveBeenCalled();
            expect(onSelectedStopsChange).toHaveBeenCalledWith([featureA]);
        });
    });

    describe('custom stops', () => {
        beforeEach(() => {
            setupGoogleMapsMock();
        });

        it('keeps the stop when the click closes a drag of it', () => {
            const stop = createMockCustomStop();
            const { mockMap, onSelectedStopsChange } = renderMarkers({ mode: 'route', selectedStops: [stop] });

            mockMap.data._emit('mousedown', buildClickEvent(stop));
            mockMap.data._emit('setgeometry', { feature: stop });
            mockMap.data._emit('click', buildClickEvent(stop));

            expect(onSelectedStopsChange).not.toHaveBeenCalled();

            // The press that starts the next gesture clears the drag.
            mockMap.data._emit('mousedown', buildClickEvent(stop));
            mockMap.data._emit('click', buildClickEvent(stop));

            expect(onSelectedStopsChange).toHaveBeenCalledTimes(1);
        });
    });

    describe('route mode', () => {
        beforeEach(() => {
            setupGoogleMapsMock();
        });

        it('adds a plainly tapped marker to the route', () => {
            const featureA = createMockFeature('A');
            const featureB = createMockFeature('B');
            const { mockMap, onSelectedStopsChange } = renderMarkers({ mode: 'route', selectedStops: [featureA] });

            mockMap.data._emit('click', buildClickEvent(featureB));

            expect(onSelectedStopsChange).toHaveBeenCalledWith([featureA, featureB]);
        });

        it('takes a marker back out of the route when it is tapped again', () => {
            const featureA = createMockFeature('A');
            const featureB = createMockFeature('B');
            const { mockMap, onSelectedStopsChange } = renderMarkers({
                mode: 'route',
                selectedStops: [featureA, featureB],
            });

            mockMap.data._emit('click', buildClickEvent(featureA));

            expect(onSelectedStopsChange).toHaveBeenCalledWith([featureB]);
        });

        it('leaves the visit styles alone on a double tap', () => {
            const featureA = createMockFeature('A');
            const { mockMap, onSelectedStopsChange } = renderMarkers({ mode: 'route', selectedStops: [featureA] });
            (mockMap.data.overrideStyle as ReturnType<typeof vi.fn>).mockClear();

            mockMap.data._emit('dblclick', buildClickEvent(featureA));

            expect(onSelectedStopsChange).not.toHaveBeenCalled();
            expect(mockMap.data.overrideStyle).not.toHaveBeenCalled();
        });

        it('swaps a numbered marker with the previous one on a right-click', () => {
            const featureA = createMockFeature('A');
            const featureB = createMockFeature('B');
            const featureC = createMockFeature('C');
            const { mockMap, onSelectedStopsChange } = renderMarkers({
                mode: 'route',
                selectedStops: [featureA, featureB, featureC],
            });
            (mockMap.data.overrideStyle as ReturnType<typeof vi.fn>).mockClear();

            mockMap.data._emit('rightclick', buildClickEvent(featureC));

            expect(onSelectedStopsChange).toHaveBeenCalledWith([featureA, featureC, featureB]);
            // Reordering is not a visit-style change.
            expect(mockMap.data.overrideStyle).not.toHaveBeenCalled();
        });

        it('takes no more stops once the route is full', () => {
            const full = Array.from({ length: MAX_ROUTE_STOPS }, (_, i) => createMockFeature(`${i}`));
            const extra = createMockFeature('extra');
            const { mockMap, onSelectedStopsChange } = renderMarkers({ mode: 'route', selectedStops: full });

            mockMap.data._emit('click', buildClickEvent(extra));

            // The route comes back unchanged rather than dropped, the same
            // refusal toggleRouteStop itself returns.
            expect(onSelectedStopsChange).toHaveBeenCalledWith(full);
        });
    });

    it('does not leave stale features when remounted after storage switch', () => {
        const mockMap = createMockMap();
        const mockFeatures = [createMockFeature('18786'), createMockFeature('18787')];
        mockMap.data._setFeatures(mockFeatures);

        const props = {
            map: mockMap,
            mode: 'normal' as MapMode,
            selectedStops: [] as Feature[],
            onSelectedStopsChange: vi.fn(),
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

describe('toggleRouteStop', () => {
    it('appends a new feature to the route under the cap', () => {
        const a = createMockFeature('A');
        const b = createMockFeature('B');

        expect(toggleRouteStop([a], b)).toEqual([a, b]);
    });

    it('takes a feature out of the route when already present', () => {
        const a = createMockFeature('A');
        const b = createMockFeature('B');

        expect(toggleRouteStop([a, b], a)).toEqual([b]);
    });

    it('takes a custom stop back out the same way a station goes', () => {
        const a = createMockFeature('A');
        const stop = createMockCustomStop();

        expect(toggleRouteStop([a, stop], stop)).toEqual([a]);
    });

    it('returns the same array once the route is full', () => {
        const existing = Array.from({ length: MAX_ROUTE_STOPS }, (_, i) => createMockFeature(`${i}`));
        const extra = createMockFeature('extra');

        expect(toggleRouteStop(existing, extra)).toBe(existing);
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
            f: Feature
        ) => StyleOptions;
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
