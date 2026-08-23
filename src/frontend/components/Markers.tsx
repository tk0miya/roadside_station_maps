import { useEffect, useRef } from 'react';
import { MARKER_ICONS, numberedMarkerIcon } from '../marker-icons';
import { hasPointAt, isCustomPoint, isRouteFull } from '../route';
import type { Storage } from '../storage';
import * as style from '../style';
import { getStyle } from '../style';
import type { StationsGeoJSON } from '../types/geojson';
import type { MapMode } from '../types/station-map';
import { useModifierHeld } from '../use-modifier-held';

// Add a custom route point at `position` and return its feature. It is created
// hidden: applyMultiSelection reveals it once the selection gives it a number,
// which keeps it from flashing a station icon in between.
function addCustomPoint(map: google.maps.Map, position: google.maps.LatLng): google.maps.Data.Feature {
    return map.data.add({
        geometry: new google.maps.Data.Point(position),
        properties: { customPoint: true },
    });
}

// Put a custom route point at `position` and return the route it joins, or
// nothing at all when the route is full or already has a point standing there.
// Both are checked before the point is created, so a refused point leaves no
// marker behind. The point goes on the end, the same place a tapped marker
// takes.
export function dropRoutePoint(
    map: google.maps.Map,
    position: google.maps.LatLng,
    multiSelected: google.maps.Data.Feature[]
): google.maps.Data.Feature[] | null {
    if (isRouteFull(multiSelected) || hasPointAt(multiSelected, position)) return null;
    return [...multiSelected, addCustomPoint(map, position)];
}

// `undefined` fields mean "no change".
export interface MarkerClickResult {
    selected?: google.maps.Data.Feature[];
    cycleStyleOn?: google.maps.Data.Feature;
}

// What a click on a marker does. It never changes the mode, only what is picked
// in it.
export function resolveMarkerClick(
    mode: MapMode,
    selected: google.maps.Data.Feature[],
    clickedFeature: google.maps.Data.Feature
): MarkerClickResult {
    if (mode === 'route') {
        if (selected.includes(clickedFeature)) {
            return { selected: selected.filter((stop) => stop !== clickedFeature) };
        }
        // A full route takes no more, and says so by leaving the click alone.
        if (isRouteFull(selected)) {
            return {};
        }
        return { selected: [...selected, clickedFeature] };
    }

    if (selected[0] === clickedFeature) {
        return { cycleStyleOn: clickedFeature };
    }
    return { selected: [clickedFeature] };
}

// Move `feature` one number earlier in the route order, wrapping the first
// marker around to the end so repeated calls walk a marker through every
// position. Returns the input array itself when the order cannot change, so the
// state update bails out instead of re-numbering markers for nothing.
export function cycleRouteNumber(
    multiSelected: google.maps.Data.Feature[],
    feature: google.maps.Data.Feature
): google.maps.Data.Feature[] {
    const index = multiSelected.indexOf(feature);
    if (index < 0 || multiSelected.length === 1) return multiSelected;
    if (index === 0) return [...multiSelected.slice(1), feature];
    const next = [...multiSelected];
    next[index - 1] = feature;
    next[index] = multiSelected[index - 1];
    return next;
}

const styleOptionsFor = (styleId: number): google.maps.Data.StyleOptions => ({
    icon: MARKER_ICONS[styleId],
});

// Base style of the data layer: a station shows the icon its stored style id
// maps to, and a custom route point has none to show.
const baseStyleFor = (feature: google.maps.Data.Feature, storage: Storage): google.maps.Data.StyleOptions => {
    if (isCustomPoint(feature)) {
        return { visible: false };
    }
    return styleOptionsFor(getStyle(storage, feature.getProperty('stationId') as string));
};

export const isModifierPressed = (event: google.maps.MapMouseEvent): boolean => {
    const domEvent = event.domEvent as MouseEvent | undefined;
    return Boolean(domEvent && (domEvent.metaKey || domEvent.ctrlKey));
};

// Cycle the stored style id for the feature's station and re-apply the
// resulting icon to the map's data layer.
export function changeStyle(map: google.maps.Map, feature: google.maps.Data.Feature, storage: Storage): void {
    const stationId = feature.getProperty('stationId') as string;
    const newStyleId = style.changeStyle(storage, stationId);
    map.data.overrideStyle(feature, styleOptionsFor(newStyleId));
}

// Clear the stored style id for the feature's station and restore the
// default icon on the map's data layer.
export function resetStyle(map: google.maps.Map, feature: google.maps.Data.Feature, storage: Storage): void {
    const stationId = feature.getProperty('stationId') as string;
    const newStyleId = style.resetStyle(storage, stationId);
    map.data.overrideStyle(feature, styleOptionsFor(newStyleId));
}

interface MarkerHandlers {
    onMarkerClick: (event: google.maps.Data.MouseEvent) => void;
    onMarkerDoubleClick: (event: google.maps.Data.MouseEvent) => void;
    onMarkerRightClick: (event: google.maps.Data.MouseEvent) => void;
    onMarkerMouseDown: () => void;
    onFeatureDragged: () => void;
}

// Load the road-station GeoJSON onto the map's data layer, wire the marker
// listeners, and install the storage-driven style callback. Returns a cleanup
// that detaches the listeners and removes every feature.
export function loadRoadStations(
    map: google.maps.Map,
    stations: StationsGeoJSON,
    storage: Storage,
    handlers: MarkerHandlers
): () => void {
    map.data.addGeoJson(stations);
    const listeners = [
        map.data.addListener('click', handlers.onMarkerClick),
        map.data.addListener('dblclick', handlers.onMarkerDoubleClick),
        map.data.addListener('rightclick', handlers.onMarkerRightClick),
        map.data.addListener('mousedown', handlers.onMarkerMouseDown),
        // Dragging a custom point is the only thing that moves a geometry.
        map.data.addListener('setgeometry', handlers.onFeatureDragged),
    ];
    map.data.setStyle((feature: google.maps.Data.Feature) => baseStyleFor(feature, storage));

    return () => {
        for (const listener of listeners) {
            listener.remove();
        }
        const features: google.maps.Data.Feature[] = [];
        map.data.forEach((f) => {
            features.push(f);
        });
        for (const f of features) {
            map.data.remove(f);
        }
    };
}

// Diff `previous` against `next` and reapply icons on the data layer:
// features no longer selected fall back to their storage-driven icon, while
// features in `next` receive a 1-based numbered icon matching their position.
// A custom point exists only as part of a route, so leaving the selection
// takes its marker off the map rather than restoring a station icon. It is
// draggable the whole time it is on the map: unlike a station, it stands for
// nothing but the position the user gave it.
export function applyMultiSelection(
    map: google.maps.Map,
    previous: google.maps.Data.Feature[],
    next: google.maps.Data.Feature[],
    storage: Storage
): void {
    for (const feature of previous) {
        if (next.includes(feature)) continue;
        if (isCustomPoint(feature)) {
            map.data.remove(feature);
            continue;
        }
        const stationId = feature.getProperty('stationId') as string;
        map.data.overrideStyle(feature, styleOptionsFor(getStyle(storage, stationId)));
    }
    next.forEach((feature, index) => {
        const numbered: google.maps.Data.StyleOptions = { icon: numberedMarkerIcon(index + 1) };
        map.data.overrideStyle(
            feature,
            isCustomPoint(feature) ? { ...numbered, visible: true, draggable: true } : numbered
        );
    });
}

interface MarkersProps {
    map: google.maps.Map | null;
    mode: MapMode;
    selected: google.maps.Data.Feature[];
    onSelectedChange: (update: (prev: google.maps.Data.Feature[]) => google.maps.Data.Feature[]) => void;
    storage: Storage;
    stations: StationsGeoJSON | null;
    onStyleChange: () => void;
    // Called by the modifier gestures, which open the mode with `seed` in it.
    onEnterRouteMode: (seed: google.maps.Data.Feature) => void;
}

export function Markers(props: MarkersProps) {
    // The listeners are installed once, so what they read has to come from a ref
    // rather than the render they were created in.
    const modeRef = useRef<MapMode>(props.mode);
    const selectedRef = useRef<google.maps.Data.Feature[]>(props.selected);
    // The stops as the map currently draws them, which the next change diffs
    // against to know which markers to re-number and which to take off.
    const drawnStopsRef = useRef<google.maps.Data.Feature[]>([]);
    const storageRef = useRef<Storage>(props.storage);
    // Set when a drag moved a custom point, cleared by the next press on a
    // marker. Dragging a point ends with a mouseup on it, and a click on a
    // chosen marker takes it back out of the route, so the release that finishes
    // a drag must not be taken for the click that removes what was just
    // positioned.
    const draggedRef = useRef(false);
    const modifierHeld = useModifierHeld();

    useEffect(() => {
        modeRef.current = props.mode;
        selectedRef.current = props.selected;
    }, [props.mode, props.selected]);

    // Keep handlers and the data-layer style callback bound to the latest storage
    // so login/logout transitions immediately switch storage backends without remounting.
    useEffect(() => {
        storageRef.current = props.storage;
        if (!props.map) return;
        props.map.data.setStyle((feature: google.maps.Data.Feature) => baseStyleFor(feature, storageRef.current));
    }, [props.map, props.storage]);

    useEffect(() => {
        if (!props.map || !props.stations) return;
        return loadRoadStations(props.map, props.stations, storageRef.current, {
            onMarkerClick,
            onMarkerDoubleClick,
            onMarkerRightClick,
            onMarkerMouseDown: () => {
                draggedRef.current = false;
            },
            onFeatureDragged: () => {
                draggedRef.current = true;
            },
        });
    }, [props.map, props.stations]);

    // The gesture on the map itself, as opposed to on a marker. One landing on a
    // marker never arrives here: the data layer takes that event.
    useEffect(() => {
        if (!props.map) return;
        const listener = props.map.addListener('dblclick', onMapDoubleClick);
        return () => listener.remove();
    }, [props.map]);

    // The modifier turns a double-click into the way into route mode, so the map
    // must not read the same gesture as a zoom-in while it is held.
    useEffect(() => {
        props.map?.setOptions({ disableDoubleClickZoom: modifierHeld && props.mode === 'normal' });
    }, [props.map, modifierHeld, props.mode]);

    useEffect(() => {
        if (!props.map) return;
        const stops = props.mode === 'route' ? props.selected : [];
        applyMultiSelection(props.map, drawnStopsRef.current, stops, storageRef.current);
        drawnStopsRef.current = stops;
    }, [props.map, props.mode, props.selected]);

    const applyClickResult = (result: MarkerClickResult) => {
        if (result.selected !== undefined) {
            const { selected } = result;
            props.onSelectedChange(() => selected);
        }
        if (result.cycleStyleOn && props.map) {
            changeStyle(props.map, result.cycleStyleOn, storageRef.current);
            props.onStyleChange();
        }
    };

    const onMarkerClick = (event: google.maps.Data.MouseEvent) => {
        if (!props.map) return;
        if (draggedRef.current) return;

        if (modeRef.current === 'normal' && isModifierPressed(event)) {
            props.onEnterRouteMode(event.feature);
            return;
        }
        applyClickResult(resolveMarkerClick(modeRef.current, selectedRef.current, event.feature));
    };

    const onMapDoubleClick = (event: google.maps.MapMouseEvent) => {
        if (!props.map || modeRef.current === 'route') return;
        if (!isModifierPressed(event) || !event.latLng) return;
        props.onEnterRouteMode(addCustomPoint(props.map, event.latLng));
    };

    const onMarkerDoubleClick = (event: google.maps.Data.MouseEvent) => {
        if (!props.map) return;
        // A modifier + double-click is stopped here as well: its first click
        // already opened route mode.
        if (modeRef.current === 'route') return;
        changeStyle(props.map, event.feature, storageRef.current);
        props.onStyleChange();
    };

    const onMarkerRightClick = (event: google.maps.Data.MouseEvent) => {
        if (!props.map) return;
        if (modeRef.current === 'route') {
            props.onSelectedChange((prev) => cycleRouteNumber(prev, event.feature));
            return;
        }
        resetStyle(props.map, event.feature, storageRef.current);
        props.onSelectedChange(() => []);
        props.onStyleChange();
    };

    return null; // This component doesn't render anything directly
}
