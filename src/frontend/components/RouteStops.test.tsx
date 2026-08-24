/**
 * @vitest-environment jsdom
 */

import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, type vi } from 'vitest';
import {
    createMockCustomStop,
    createMockFeature,
    createMockLatLng,
    createMockMap,
    setupGoogleMapsMock,
} from '#test-utils/test-utils';
import { MARKER_ICONS } from '../marker-icons';
import { isCustomStop, MAX_ROUTE_STOPS } from '../route';
import { MemoryStorage } from '../storage/memory-storage';
import type { MapMode } from '../types/station-map';
import { addCustomStopAt, drawRouteStops, RouteStops } from './RouteStops';

describe('RouteStops', () => {
    beforeEach(() => {
        setupGoogleMapsMock();
    });

    // What the map is told to draw is derived from the mode, not read off
    // `selectedStops`. The first of these holds that leaving the mode reaches the
    // map as a change to apply rather than a redraw to skip; the second holds the
    // derivation itself, since `selectedStops` on its own would number a station
    // whose details were merely opened.
    it('takes the route off the map when route mode is left', () => {
        const mockMap = createMockMap();
        const station = createMockFeature('A');
        const stop = createMockCustomStop();
        const props = { map: mockMap, storage: new MemoryStorage() };

        const { rerender } = render(<RouteStops {...props} mode="route" selectedStops={[station, stop]} />);
        (mockMap.data.overrideStyle as ReturnType<typeof vi.fn>).mockClear();

        rerender(<RouteStops {...props} mode="normal" selectedStops={[]} />);

        // The custom stop leaves the map, and the station takes its stored
        // icon back in place of its number.
        expect(mockMap.data.remove).toHaveBeenCalledWith(stop);
        expect(mockMap.data.overrideStyle).toHaveBeenCalledWith(station, { icon: MARKER_ICONS[0] });
    });

    it('numbers nothing in normal mode: a station opened there is not in the route', () => {
        const mockMap = createMockMap();
        const station = createMockFeature('A');
        const props = { map: mockMap, mode: 'normal' as MapMode, storage: new MemoryStorage() };

        const { rerender } = render(<RouteStops {...props} selectedStops={[]} />);
        (mockMap.data.overrideStyle as ReturnType<typeof vi.fn>).mockClear();

        rerender(<RouteStops {...props} selectedStops={[station]} />);

        expect(mockMap.data.overrideStyle).not.toHaveBeenCalled();
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

describe('drawRouteStops', () => {
    beforeEach(() => {
        setupGoogleMapsMock();
    });

    it('numbers each feature in `next` by 1-based position', () => {
        const mockMap = createMockMap();
        const a = createMockFeature('A');
        const b = createMockFeature('B');
        const storage = new MemoryStorage();

        drawRouteStops(mockMap, [], [a, b], storage);

        const calls = (mockMap.data.overrideStyle as ReturnType<typeof vi.fn>).mock.calls;
        expect(calls).toHaveLength(2);
        expect(calls[0][0]).toBe(a);
        expect(calls[0][1].icon).toMatchObject({ url: expect.stringContaining('svg') });
        expect(calls[1][0]).toBe(b);
    });

    it('restores storage-driven icons for features that are no longer in the route', () => {
        const mockMap = createMockMap();
        const a = createMockFeature('A');
        const b = createMockFeature('B');
        const storage = new MemoryStorage();
        storage.setItem('A', '2');

        drawRouteStops(mockMap, [a, b], [], storage);

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

        drawRouteStops(mockMap, [], [stop], storage);

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

        drawRouteStops(mockMap, [a, stop], [a], storage);

        expect(mockMap.data.remove).toHaveBeenCalledWith(stop);
        // The station keeps its marker; only its icon goes back to the stored one.
        expect(mockMap.data.remove).toHaveBeenCalledTimes(1);
    });

    it('only re-numbers features that are still in the route while resetting the rest', () => {
        const mockMap = createMockMap();
        const a = createMockFeature('A');
        const b = createMockFeature('B');
        const c = createMockFeature('C');
        const storage = new MemoryStorage();

        drawRouteStops(mockMap, [a, b], [b, c], storage);

        // `a` is no longer in the route → restored to default icon
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
