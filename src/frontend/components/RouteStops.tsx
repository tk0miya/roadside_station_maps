import { useEffect, useRef } from 'react';
import type { Feature, GoogleMap, LatLng, StyleOptions } from '../google-maps-types';
import { MARKER_ICONS, numberedMarkerIcon } from '../marker-icons';
import { hasCustomStopAt, isCustomStop, isRouteFull } from '../route';
import type { Storage } from '../storage';
import { getStyle } from '../style';
import type { MapMode } from '../types/station-map';

// Create a custom stop at `position` and return its feature, without putting it
// in a route. It is created hidden: drawRouteStops reveals it once the route
// gives it a number, which keeps it from flashing a station icon in between.
export function createCustomStop(map: GoogleMap, position: LatLng): Feature {
    return map.data.add({
        geometry: new google.maps.Data.Point(position),
        properties: { customStop: true },
    });
}

// The duplicate-position refusal answers pressing the add button twice without
// moving the map: two custom stops on one spot are a single marker to look at,
// two stops to pay for, and one of them impossible to reach without taking the
// other off first. The stop goes on the end, the same place a tapped marker
// takes.
export function addCustomStopAt(map: GoogleMap, stops: Feature[], position: LatLng): Feature[] | null {
    if (isRouteFull(stops) || hasCustomStopAt(stops, position)) return null;
    return [...stops, createCustomStop(map, position)];
}

const styleOptionsFor = (styleId: number): StyleOptions => ({
    icon: MARKER_ICONS[styleId],
});

// Draw `next` as the route's stops by diffing it against `previous`: features
// that are no longer in the route fall back to their storage-driven icon, while
// the stops in `next` receive a 1-based numbered icon matching their position.
// A custom stop exists only as part of a route, so leaving the route takes its
// marker off the map rather than restoring a station icon. It is draggable the
// whole time it is on the map: unlike a station, it stands for nothing but the
// position the user gave it.
export function drawRouteStops(map: GoogleMap, previous: Feature[], next: Feature[], storage: Storage): void {
    for (const feature of previous) {
        if (next.includes(feature)) continue;
        if (isCustomStop(feature)) {
            map.data.remove(feature);
            continue;
        }
        const stationId = feature.getProperty('stationId') as string;
        map.data.overrideStyle(feature, styleOptionsFor(getStyle(storage, stationId)));
    }
    next.forEach((feature, index) => {
        const numbered: StyleOptions = { icon: numberedMarkerIcon(index + 1) };
        map.data.overrideStyle(
            feature,
            isCustomStop(feature) ? { ...numbered, visible: true, draggable: true } : numbered
        );
    });
}

interface RouteStopsProps {
    map: GoogleMap | null;
    mode: MapMode;
    selectedStops: Feature[];
    storage: Storage;
}

// Keeps the map's numbered markers in sync with the route being built. Reads
// nothing from `selectedStops` outside route mode: a station opened in normal
// mode is a pick, not a stop, so leaving the mode takes the route's markers off
// rather than redrawing whatever is merely selected.
export function RouteStops(props: RouteStopsProps) {
    // The route's stops as the map currently draws them, which the next change
    // diffs against to know which markers to re-number and which to take off.
    const drawnRouteStopsRef = useRef<Feature[]>([]);
    // A storage change alone should not redraw a route that has not changed, so
    // this is read from a ref rather than being a redraw trigger of its own.
    const storageRef = useRef<Storage>(props.storage);

    useEffect(() => {
        storageRef.current = props.storage;
    }, [props.storage]);

    useEffect(() => {
        if (!props.map) return;
        const routeStops = props.mode === 'route' ? props.selectedStops : [];
        drawRouteStops(props.map, drawnRouteStopsRef.current, routeStops, storageRef.current);
        drawnRouteStopsRef.current = routeStops;
    }, [props.map, props.mode, props.selectedStops]);

    return null; // This component doesn't render anything directly
}
