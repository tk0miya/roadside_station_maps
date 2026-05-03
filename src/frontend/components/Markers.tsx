import { useEffect, useRef } from 'react';

import { MARKER_ICONS, numberedMarkerIcon } from '../marker-icons';
import type { Storage } from '../storage';
import * as style from '../style';
import { getStyle } from '../style';
import { StationsGeoJSON } from '../types/geojson';

// Google Maps directions support at most 10 stops (origin + destination
// + 8 waypoints), so the route-selection set is capped just under that bound.
export const MAX_ROUTE_SELECTION = 9;

export interface MarkerClickContext {
    clickedFeature: google.maps.Data.Feature;
    modifierPressed: boolean;
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
    selectedFeature,
    multiSelected,
}: MarkerClickContext): MarkerClickResult {
    if (modifierPressed) {
        // Modifier-click always suppresses single-selection regardless of
        // prior state, so always emit a (possibly redundant) clear.
        if (selectedFeature) {
            // Extending a single selection: lift the previously selected
            // marker into the set together with the newly clicked one.
            return {
                selectedFeature: null,
                multiSelected:
                    selectedFeature === clickedFeature
                        ? [selectedFeature]
                        : [selectedFeature, clickedFeature],
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

const styleOptionsFor = (styleId: number): google.maps.Data.StyleOptions => ({
    icon: MARKER_ICONS[styleId],
});

const isModifierPressed = (event: google.maps.Data.MouseEvent): boolean => {
    const domEvent = event.domEvent as MouseEvent | undefined;
    return Boolean(domEvent && (domEvent.metaKey || domEvent.ctrlKey));
};

// Cycle the stored style id for the feature's station and re-apply the
// resulting icon to the map's data layer.
export function changeStyle(
    map: google.maps.Map,
    feature: google.maps.Data.Feature,
    storage: Storage,
): void {
    const stationId = feature.getProperty('stationId') as string;
    const newStyleId = style.changeStyle(storage, stationId);
    map.data.overrideStyle(feature, styleOptionsFor(newStyleId));
}

// Clear the stored style id for the feature's station and restore the
// default icon on the map's data layer.
export function resetStyle(
    map: google.maps.Map,
    feature: google.maps.Data.Feature,
    storage: Storage,
): void {
    const stationId = feature.getProperty('stationId') as string;
    const newStyleId = style.resetStyle(storage, stationId);
    map.data.overrideStyle(feature, styleOptionsFor(newStyleId));
}

interface MarkerHandlers {
    onMarkerClick: (event: google.maps.Data.MouseEvent) => void;
    onMarkerDoubleClick: (event: google.maps.Data.MouseEvent) => void;
    onMarkerRightClick: (event: google.maps.Data.MouseEvent) => void;
}

// Load the road-station GeoJSON onto the map's data layer, wire click /
// dblclick / rightclick listeners, and install the storage-driven style
// callback. Returns a cleanup that detaches the listeners and removes
// every feature.
export function loadRoadStations(
    map: google.maps.Map,
    stations: StationsGeoJSON,
    storage: Storage,
    handlers: MarkerHandlers,
): () => void {
    map.data.addGeoJson(stations);
    const clickListener = map.data.addListener('click', handlers.onMarkerClick);
    const doubleClickListener = map.data.addListener('dblclick', handlers.onMarkerDoubleClick);
    const rightClickListener = map.data.addListener('rightclick', handlers.onMarkerRightClick);
    map.data.setStyle((feature: google.maps.Data.Feature) => {
        const stationId = feature.getProperty('stationId') as string;
        return styleOptionsFor(getStyle(storage, stationId));
    });

    return () => {
        clickListener.remove();
        doubleClickListener.remove();
        rightClickListener.remove();
        const features: google.maps.Data.Feature[] = [];
        map.data.forEach((f) => features.push(f));
        features.forEach((f) => map.data.remove(f));
    };
}

// Diff `previous` against `next` and reapply icons on the data layer:
// features no longer selected fall back to their storage-driven icon, while
// features in `next` receive a 1-based numbered icon matching their position.
export function applyMultiSelection(
    map: google.maps.Map,
    previous: google.maps.Data.Feature[],
    next: google.maps.Data.Feature[],
    storage: Storage,
): void {
    for (const feature of previous) {
        if (!next.includes(feature)) {
            const stationId = feature.getProperty('stationId') as string;
            map.data.overrideStyle(feature, styleOptionsFor(getStyle(storage, stationId)));
        }
    }
    next.forEach((feature, index) => {
        map.data.overrideStyle(feature, { icon: numberedMarkerIcon(index + 1) });
    });
}

interface MarkersProps {
    map: google.maps.Map | null;
    selectedFeature: google.maps.Data.Feature | null;
    onFeatureSelect: (feature: google.maps.Data.Feature | null) => void;
    multiSelected: google.maps.Data.Feature[];
    onMultiSelectChange: (
        update: (prev: google.maps.Data.Feature[]) => google.maps.Data.Feature[],
    ) => void;
    storage: Storage;
    stations: StationsGeoJSON | null;
    onStyleChange: () => void;
}

export function Markers(props: MarkersProps) {
    const selectedFeatureRef = useRef<google.maps.Data.Feature | null>(null);
    const multiSelectedRef = useRef<google.maps.Data.Feature[]>(props.multiSelected);
    const storageRef = useRef<Storage>(props.storage);

    useEffect(() => {
        selectedFeatureRef.current = props.selectedFeature;
    }, [props.selectedFeature]);

    // Keep handlers and the data-layer style callback bound to the latest storage
    // so login/logout transitions immediately switch storage backends without remounting.
    useEffect(() => {
        storageRef.current = props.storage;
        if (!props.map) return;
        props.map.data.setStyle((feature: google.maps.Data.Feature) => {
            const stationId = feature.getProperty('stationId') as string;
            return styleOptionsFor(getStyle(storageRef.current, stationId));
        });
    }, [props.map, props.storage]);

    useEffect(() => {
        if (!props.map || !props.stations) return;
        return loadRoadStations(props.map, props.stations, storageRef.current, {
            onMarkerClick,
            onMarkerDoubleClick,
            onMarkerRightClick,
        });
    }, [props.map, props.stations]);

    useEffect(() => {
        if (!props.map) return;
        applyMultiSelection(
            props.map,
            multiSelectedRef.current,
            props.multiSelected,
            storageRef.current,
        );
        multiSelectedRef.current = props.multiSelected;
    }, [props.map, props.multiSelected]);

    const onMarkerClick = (event: google.maps.Data.MouseEvent) => {
        if (!props.map) return;

        const result = resolveMarkerClick({
            clickedFeature: event.feature,
            modifierPressed: isModifierPressed(event),
            selectedFeature: selectedFeatureRef.current,
            multiSelected: multiSelectedRef.current,
        });

        if (result.selectedFeature !== undefined) {
            props.onFeatureSelect(result.selectedFeature);
        }
        if (result.multiSelected !== undefined) {
            const { multiSelected } = result;
            props.onMultiSelectChange(() => multiSelected);
        }
        if (result.cycleStyleOn) {
            changeStyle(props.map, result.cycleStyleOn, storageRef.current);
            props.onStyleChange();
        }
    };

    const onMarkerDoubleClick = (event: google.maps.Data.MouseEvent) => {
        if (!props.map) return;
        // Modifier + double-click has no defined meaning; ignore it.
        if (isModifierPressed(event)) return;
        if (multiSelectedRef.current.length > 0) {
            props.onMultiSelectChange(() => []);
        }
        changeStyle(props.map, event.feature, storageRef.current);
        props.onStyleChange();
    };

    const onMarkerRightClick = (event: google.maps.Data.MouseEvent) => {
        if (!props.map) return;
        // Modifier + right-click has no defined meaning; ignore it.
        if (isModifierPressed(event)) return;
        if (multiSelectedRef.current.length > 0) {
            props.onMultiSelectChange(() => []);
        }
        resetStyle(props.map, event.feature, storageRef.current);
        props.onFeatureSelect(null);
        props.onStyleChange();
    };

    return null; // This component doesn't render anything directly
}
