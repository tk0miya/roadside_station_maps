import { useEffect, useRef } from 'react';

import { MARKER_ICONS, numberedMarkerIcon } from '../marker-icons';
import type { Storage } from '../storage';
import { changeStyle, getStyle, resetStyle } from '../style';
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

        props.map.data.addGeoJson(props.stations);
        const clickListener = props.map.data.addListener('click', onMarkerClick);
        const doubleClickListener = props.map.data.addListener('dblclick', onMarkerDoubleClick);
        const rightClickListener = props.map.data.addListener('rightclick', onMarkerRightClick);
        props.map.data.setStyle((feature: google.maps.Data.Feature) => {
            const stationId = feature.getProperty('stationId') as string;
            return styleOptionsFor(getStyle(storageRef.current, stationId));
        });

        const map = props.map;
        return () => {
            clickListener.remove();
            doubleClickListener.remove();
            rightClickListener.remove();
            const features: google.maps.Data.Feature[] = [];
            map.data.forEach((f) => features.push(f));
            features.forEach((f) => map.data.remove(f));
        };
    }, [props.map, props.stations]);

    // Apply numbered icons to currently multi-selected features and restore
    // the storage-driven icon to features that were just deselected.
    useEffect(() => {
        if (!props.map) return;
        const previous = multiSelectedRef.current;
        const next = props.multiSelected;

        for (const feature of previous) {
            if (!next.includes(feature)) {
                const stationId = feature.getProperty('stationId') as string;
                props.map.data.overrideStyle(feature, styleOptionsFor(getStyle(storageRef.current, stationId)));
            }
        }
        next.forEach((feature, index) => {
            props.map?.data.overrideStyle(feature, { icon: numberedMarkerIcon(index + 1) });
        });

        multiSelectedRef.current = next;
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
            const stationId = result.cycleStyleOn.getProperty('stationId') as string;
            const newStyleId = changeStyle(storageRef.current, stationId);
            props.map.data.overrideStyle(result.cycleStyleOn, styleOptionsFor(newStyleId));
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
        const stationId = event.feature.getProperty('stationId') as string;
        const newStyleId = changeStyle(storageRef.current, stationId);
        props.map.data.overrideStyle(event.feature, styleOptionsFor(newStyleId));
        props.onStyleChange();
    };

    const onMarkerRightClick = (event: google.maps.Data.MouseEvent) => {
        if (!props.map) return;
        // Modifier + right-click has no defined meaning; ignore it.
        if (isModifierPressed(event)) return;
        if (multiSelectedRef.current.length > 0) {
            props.onMultiSelectChange(() => []);
        }
        const stationId = event.feature.getProperty('stationId') as string;
        const newStyleId = resetStyle(storageRef.current, stationId);
        props.map.data.overrideStyle(event.feature, styleOptionsFor(newStyleId));
        props.onFeatureSelect(null);
        props.onStyleChange();
    };

    return null; // This component doesn't render anything directly
}
