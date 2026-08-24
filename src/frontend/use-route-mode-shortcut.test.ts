/**
 * @vitest-environment jsdom
 */

import { fireEvent, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockFeature, createMockLatLng, createMockMap, setupGoogleMapsMock } from '#test-utils/test-utils';
import { isCustomStop, MAX_ROUTE_STOPS } from './route';
import type { MapMode } from './types/station-map';
import { useRouteModeShortcut } from './use-route-mode-shortcut';

const buildMapClickEvent = (modifier?: 'meta' | 'ctrl', lat = 36.5, lng = 140.5): google.maps.MapMouseEvent =>
    ({
        latLng: createMockLatLng(lat, lng),
        domEvent: {
            metaKey: modifier === 'meta',
            ctrlKey: modifier === 'ctrl',
        } as unknown as MouseEvent,
    }) as google.maps.MapMouseEvent;

describe('useRouteModeShortcut', () => {
    beforeEach(() => {
        setupGoogleMapsMock();
    });

    const renderShortcut = (overrides: { mode?: MapMode; selectedStops?: google.maps.Data.Feature[] } = {}) => {
        const mockMap = createMockMap();
        const onSelectedStopsChange = vi.fn();
        const onEnterRouteMode = vi.fn();
        renderHook(() =>
            useRouteModeShortcut({
                map: mockMap,
                mode: overrides.mode ?? 'normal',
                selectedStops: overrides.selectedStops ?? [],
                onSelectedStopsChange,
                onEnterRouteMode,
            })
        );
        return { mockMap, onSelectedStopsChange, onEnterRouteMode };
    };

    // The feature map.data.add() handed back for the double-click.
    const addedStop = (mockMap: ReturnType<typeof createMockMap>) =>
        (mockMap.data.add as ReturnType<typeof vi.fn>).mock.results[0]?.value;

    describe('the way into route mode', () => {
        it('opens the mode with a custom stop where a Ctrl + double-click landed', () => {
            const { mockMap, onEnterRouteMode } = renderShortcut();

            mockMap._emit('dblclick', buildMapClickEvent('ctrl', 36.5, 140.5));

            const stop = addedStop(mockMap);
            expect(isCustomStop(stop)).toBe(true);
            expect((stop.getGeometry() as google.maps.Data.Point).get().lat()).toBe(36.5);
            expect(onEnterRouteMode).toHaveBeenCalledWith(stop);
        });

        it('opens nothing on a double-click without the modifier', () => {
            const { mockMap, onEnterRouteMode } = renderShortcut();

            mockMap._emit('dblclick', buildMapClickEvent());

            expect(mockMap.data.add).not.toHaveBeenCalled();
            expect(onEnterRouteMode).not.toHaveBeenCalled();
        });
    });

    describe('zoom while the modifier is held', () => {
        it('stops the map from zooming while the modifier is held', () => {
            const { mockMap } = renderShortcut();

            fireEvent.keyDown(window, { key: 'Control', ctrlKey: true });
            expect(mockMap.setOptions).toHaveBeenLastCalledWith({ disableDoubleClickZoom: true });

            fireEvent.keyUp(window, { key: 'Control', ctrlKey: false });
            expect(mockMap.setOptions).toHaveBeenLastCalledWith({ disableDoubleClickZoom: false });
        });

        it('picks the modifier back up from a press when no keydown announced it', () => {
            const { mockMap } = renderShortcut();
            // The key went down while another window had focus.
            fireEvent.mouseDown(window, { ctrlKey: true });

            expect(mockMap.setOptions).toHaveBeenLastCalledWith({ disableDoubleClickZoom: true });
        });

        it('lets go of the modifier when the window loses focus', () => {
            const { mockMap } = renderShortcut();
            fireEvent.keyDown(window, { key: 'Control', ctrlKey: true });

            // The keyup lands in the other window, so only the blur says so.
            fireEvent.blur(window);

            expect(mockMap.setOptions).toHaveBeenLastCalledWith({ disableDoubleClickZoom: false });
        });

        // The gesture places a custom stop on both sides of the mode, so the
        // zoom stays off on both.
        it('stops the map from zooming inside route mode too', () => {
            const { mockMap } = renderShortcut({ mode: 'route' });

            fireEvent.keyDown(window, { key: 'Control', ctrlKey: true });

            expect(mockMap.setOptions).toHaveBeenLastCalledWith({ disableDoubleClickZoom: true });
        });
    });

    // RoadStationMap withholds `map` (passing null) until storage is ready,
    // the same gate the storage-dependent UI renders behind, so this gesture
    // cannot open a route mode that UI isn't there yet to show.
    describe('map withheld', () => {
        it('attaches to the map once it arrives, and detaches when withheld again', () => {
            const mockMap = createMockMap();
            const onSelectedStopsChange = vi.fn();
            const onEnterRouteMode = vi.fn();
            const { rerender } = renderHook(
                ({ map }: { map: google.maps.Map | null }) =>
                    useRouteModeShortcut({
                        map,
                        mode: 'normal',
                        selectedStops: [],
                        onSelectedStopsChange,
                        onEnterRouteMode,
                    }),
                { initialProps: { map: null as google.maps.Map | null } }
            );

            rerender({ map: mockMap });
            mockMap._emit('dblclick', buildMapClickEvent('ctrl'));
            expect(onEnterRouteMode).toHaveBeenCalledTimes(1);

            onEnterRouteMode.mockClear();
            rerender({ map: null });
            mockMap._emit('dblclick', buildMapClickEvent('ctrl'));
            expect(onEnterRouteMode).not.toHaveBeenCalled();
        });
    });

    describe('inside route mode', () => {
        it('adds a custom stop where a Cmd + double-click landed', () => {
            const featureA = createMockFeature('A');
            const { mockMap, onSelectedStopsChange, onEnterRouteMode } = renderShortcut({
                mode: 'route',
                selectedStops: [featureA],
            });

            mockMap._emit('dblclick', buildMapClickEvent('meta', 36.5, 140.5));

            const stop = addedStop(mockMap);
            expect(isCustomStop(stop)).toBe(true);
            expect((stop.getGeometry() as google.maps.Data.Point).get().lat()).toBe(36.5);
            expect(onSelectedStopsChange).toHaveBeenCalledWith([featureA, stop]);
            // Already inside; nothing reopens the mode.
            expect(onEnterRouteMode).not.toHaveBeenCalled();
        });

        it('leaves a full route alone on a Cmd + double-click', () => {
            const stops = Array.from({ length: MAX_ROUTE_STOPS }, (_, i) => createMockFeature(`S${i}`));
            const { mockMap, onSelectedStopsChange } = renderShortcut({ mode: 'route', selectedStops: stops });

            mockMap._emit('dblclick', buildMapClickEvent('meta'));

            expect(mockMap.data.add).not.toHaveBeenCalled();
            expect(onSelectedStopsChange).not.toHaveBeenCalled();
        });

        it('leaves the double-click alone without the modifier', () => {
            const { mockMap, onSelectedStopsChange } = renderShortcut({ mode: 'route' });

            mockMap._emit('dblclick', buildMapClickEvent());

            expect(mockMap.data.add).not.toHaveBeenCalled();
            expect(onSelectedStopsChange).not.toHaveBeenCalled();
        });
    });
});
