import { useEffect, useRef } from 'react';

import { MARKER_ICONS, numberedMarkerIcon } from '../marker-icons';
import { isCustomPoint, MAX_ROUTE_SELECTION } from '../route';
import type { Storage } from '../storage';
import * as style from '../style';
import { getStyle } from '../style';
import type { StationsGeoJSON } from '../types/geojson';
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

export interface MarkerClickContext {
    clickedFeature: google.maps.Data.Feature;
    modifierPressed: boolean;
    // In route mode a plain click does what a modifier-click does.
    routeMode: boolean;
    selectedFeature: google.maps.Data.Feature | null;
    multiSelected: google.maps.Data.Feature[];
}

// `undefined` fields mean "no change". Explicit `null` for `selectedFeature`
// represents clearing the single selection.
export interface MarkerClickResult {
    selectedFeature?: google.maps.Data.Feature | null;
    multiSelected?: google.maps.Data.Feature[];
    cycleStyleOn?: google.maps.Data.Feature;
}

export function resolveMarkerClick({
    clickedFeature,
    modifierPressed,
    routeMode,
    selectedFeature,
    multiSelected,
}: MarkerClickContext): MarkerClickResult {
    if (modifierPressed || routeMode) {
        // A click that edits the route always suppresses single-selection
        // regardless of prior state, so always emit a (possibly redundant) clear.
        if (selectedFeature) {
            // Extending a single selection: lift the previously selected
            // marker into the set together with the newly clicked one.
            return {
                selectedFeature: null,
                multiSelected:
                    selectedFeature === clickedFeature ? [selectedFeature] : [selectedFeature, clickedFeature],
            };
        }
        if (multiSelected.includes(clickedFeature)) {
            return {
                selectedFeature: null,
                multiSelected: multiSelected.filter((feature) => feature !== clickedFeature),
            };
        }
        if (multiSelected.length >= MAX_ROUTE_SELECTION) {
            return { selectedFeature: null, multiSelected };
        }
        return {
            selectedFeature: null,
            multiSelected: [...multiSelected, clickedFeature],
        };
    }

    // A custom route point has no station behind it, so a plain click has
    // nothing to open or cycle.
    if (isCustomPoint(clickedFeature)) {
        return {};
    }
    // Plain click clears any in-progress multi-selection before the
    // single-selection logic runs.
    if (multiSelected.length > 0) {
        return { selectedFeature: clickedFeature, multiSelected: [] };
    }
    if (selectedFeature === clickedFeature) {
        return { cycleStyleOn: clickedFeature };
    }
    return { selectedFeature: clickedFeature };
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
    selectedFeature: google.maps.Data.Feature | null;
    onFeatureSelect: (feature: google.maps.Data.Feature | null) => void;
    multiSelected: google.maps.Data.Feature[];
    onMultiSelectChange: (update: (prev: google.maps.Data.Feature[]) => google.maps.Data.Feature[]) => void;
    storage: Storage;
    stations: StationsGeoJSON | null;
    onStyleChange: () => void;
    routeMode: boolean;
}

export function Markers(props: MarkersProps) {
    const selectedFeatureRef = useRef<google.maps.Data.Feature | null>(null);
    const multiSelectedRef = useRef<google.maps.Data.Feature[]>(props.multiSelected);
    const storageRef = useRef<Storage>(props.storage);
    const routeModeRef = useRef<boolean>(props.routeMode);
    // Set when a drag moved a custom point, cleared by the next press on a
    // marker. Dragging a point ends with a mouseup on it, and a modifier-click
    // deletes the point, so the release that finishes a drag must not be taken
    // for the click that removes what was just positioned.
    const draggedRef = useRef(false);
    const modifierHeld = useModifierHeld();

    useEffect(() => {
        selectedFeatureRef.current = props.selectedFeature;
    }, [props.selectedFeature]);

    useEffect(() => {
        routeModeRef.current = props.routeMode;
    }, [props.routeMode]);

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

    // Gestures on the map itself, as opposed to on a marker. A gesture landing
    // on a marker never arrives here: the data layer takes that event.
    useEffect(() => {
        if (!props.map) return;
        const listeners = [
            props.map.addListener('dblclick', onMapDoubleClick),
            props.map.addListener('contextmenu', onMapLongPress),
        ];
        return () => {
            for (const listener of listeners) {
                listener.remove();
            }
        };
    }, [props.map]);

    // The modifier turns a double-click into "drop a route point here", so the
    // map must not read the same gesture as a zoom-in while it is held.
    useEffect(() => {
        props.map?.setOptions({ disableDoubleClickZoom: modifierHeld });
    }, [props.map, modifierHeld]);

    useEffect(() => {
        if (!props.map) return;
        applyMultiSelection(props.map, multiSelectedRef.current, props.multiSelected, storageRef.current);
        multiSelectedRef.current = props.multiSelected;
    }, [props.map, props.multiSelected]);

    const applyClickResult = (result: MarkerClickResult) => {
        if (result.selectedFeature !== undefined) {
            props.onFeatureSelect(result.selectedFeature);
        }
        if (result.multiSelected !== undefined) {
            const { multiSelected } = result;
            props.onMultiSelectChange(() => multiSelected);
        }
        if (result.cycleStyleOn && props.map) {
            changeStyle(props.map, result.cycleStyleOn, storageRef.current);
            props.onStyleChange();
        }
    };

    const onMarkerClick = (event: google.maps.Data.MouseEvent) => {
        if (!props.map) return;
        if (draggedRef.current) return;

        applyClickResult(
            resolveMarkerClick({
                clickedFeature: event.feature,
                modifierPressed: isModifierPressed(event),
                routeMode: routeModeRef.current,
                selectedFeature: selectedFeatureRef.current,
                multiSelected: multiSelectedRef.current,
            })
        );
    };

    // Put a custom route point at `position`. It takes the number after the ones
    // already chosen, which is what a modifier-click on a marker created there
    // would have done, so the click resolver decides the new order too.
    const dropRoutePoint = (map: google.maps.Map, position: google.maps.LatLng) => {
        // Checked before the point is created so a full route leaves no marker
        // behind: the resolver would refuse to number it.
        if (multiSelectedRef.current.length >= MAX_ROUTE_SELECTION) return;

        const feature = addCustomPoint(map, position);
        applyClickResult(
            resolveMarkerClick({
                clickedFeature: feature,
                modifierPressed: true,
                routeMode: routeModeRef.current,
                selectedFeature: selectedFeatureRef.current,
                multiSelected: multiSelectedRef.current,
            })
        );
    };

    // Modifier + double-click on the map is the pointer way to drop a route
    // point, where the cursor is.
    const onMapDoubleClick = (event: google.maps.MapMouseEvent) => {
        if (!props.map || !isModifierPressed(event) || !event.latLng) return;
        dropRoutePoint(props.map, event.latLng);
    };

    // A long press drops a route point without a keyboard. The Maps API reports
    // it as `contextmenu`, which is where a right-click arrives too, so the
    // pointer gesture comes along for free — and a browser that keeps the long
    // press to itself never gets here, which costs that device this one gesture
    // and nothing else. Only route mode answers it: outside the mode the
    // gesture stays the browser's, and a keyboard reaches the same thing with
    // modifier + double-click. Inside the mode the press belongs to this app,
    // so the browser's menu is not what it asked for — that holds even when a
    // full route leaves nothing to place.
    const onMapLongPress = (event: google.maps.MapMouseEvent) => {
        if (!props.map || !routeModeRef.current || !event.latLng) return;
        event.domEvent?.preventDefault();
        dropRoutePoint(props.map, event.latLng);
    };

    const onMarkerDoubleClick = (event: google.maps.Data.MouseEvent) => {
        if (!props.map) return;
        // Modifier + double-click drops a route point, and only the map itself
        // answers that gesture; on a marker it does nothing.
        if (isModifierPressed(event)) return;
        // Route mode edits the route, not the visit styles: a double tap there
        // is two taps that added and removed a stop, and cycling the style on
        // top of that — let alone dropping the route — is not what was asked.
        if (routeModeRef.current) return;
        if (isCustomPoint(event.feature)) return;
        if (multiSelectedRef.current.length > 0) {
            props.onMultiSelectChange(() => []);
        }
        changeStyle(props.map, event.feature, storageRef.current);
        props.onStyleChange();
    };

    const onMarkerRightClick = (event: google.maps.Data.MouseEvent) => {
        if (!props.map) return;
        // Modifier + right-click reorders the route, as the counterpart to
        // modifier-click appending a marker at its end.
        if (isModifierPressed(event)) {
            props.onMultiSelectChange((prev) => cycleRouteNumber(prev, event.feature));
            return;
        }
        // In route mode a gesture on a marker edits the route — reordering is the
        // modifier + right-click above, and dropping a stop is a second tap on it
        // — so resetting a visit style is not on offer. A long press that landed
        // on a marker rather than the map drops no point, but the browser menu is
        // no more what it asked for here than it is out on the map.
        if (routeModeRef.current) {
            event.domEvent?.preventDefault();
            return;
        }
        if (isCustomPoint(event.feature)) return;
        if (multiSelectedRef.current.length > 0) {
            props.onMultiSelectChange(() => []);
        }
        resetStyle(props.map, event.feature, storageRef.current);
        props.onFeatureSelect(null);
        props.onStyleChange();
    };

    return null; // This component doesn't render anything directly
}
