import { useEffect, useRef } from 'react';
import { MARKER_ICONS } from '../marker-icons';
import { cycleRouteNumber, isCustomStop, isRouteFull } from '../route';
import type { Storage } from '../storage';
import * as style from '../style';
import { getStyle } from '../style';
import type { StationsGeoJSON } from '../types/geojson';
import type { MapMode } from '../types/station-map';
import { isModifierPressed } from '../use-modifier-held';

// Take `feature` out of the route if it is already a stop, otherwise add it to
// the end — unless the route is full, which refuses the click by returning
// `stops` unchanged, the same contract `cycleRouteNumber` uses below.
export function toggleRouteStop(
    stops: google.maps.Data.Feature[],
    feature: google.maps.Data.Feature
): google.maps.Data.Feature[] {
    if (stops.includes(feature)) return stops.filter((stop) => stop !== feature);
    if (isRouteFull(stops)) return stops;
    return [...stops, feature];
}

const styleOptionsFor = (styleId: number): google.maps.Data.StyleOptions => ({
    icon: MARKER_ICONS[styleId],
});

// Base style of the data layer: a station shows the icon its stored style id
// maps to, and a custom stop has none to show.
const baseStyleFor = (feature: google.maps.Data.Feature, storage: Storage): google.maps.Data.StyleOptions => {
    if (isCustomStop(feature)) {
        return { visible: false };
    }
    return styleOptionsFor(getStyle(storage, feature.getProperty('stationId') as string));
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
        // Dragging a custom stop is the only thing that moves a geometry.
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

interface MarkersProps {
    map: google.maps.Map | null;
    mode: MapMode;
    selectedStops: google.maps.Data.Feature[];
    onSelectedStopsChange: (next: google.maps.Data.Feature[]) => void;
    storage: Storage;
    stations: StationsGeoJSON | null;
    onStyleChange: () => void;
    // Called by the modifier + marker click, which opens the mode with `seed`
    // as its first stop. The other way in via the modifier — on the map
    // itself — is not this component's concern; see useRouteModeShortcut.
    onEnterRouteMode: (seed: google.maps.Data.Feature) => void;
}

export function Markers(props: MarkersProps) {
    // The listeners are installed once, so what they read has to come from a ref
    // rather than the render they were created in.
    const modeRef = useRef<MapMode>(props.mode);
    const selectedStopsRef = useRef<google.maps.Data.Feature[]>(props.selectedStops);
    const storageRef = useRef<Storage>(props.storage);
    // Set when a drag moved a custom stop, cleared by the next press on a
    // marker. Dragging a stop ends with a mouseup on it, and a click on a
    // chosen marker takes it back out of the route, so the release that finishes
    // a drag must not be taken for the click that removes what was just
    // positioned.
    const draggedRef = useRef(false);

    useEffect(() => {
        modeRef.current = props.mode;
        selectedStopsRef.current = props.selectedStops;
    }, [props.mode, props.selectedStops]);

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

    // Cycle the style and let the app know, the outcome a re-click in normal
    // mode and a double-click on a marker both reach.
    const cycleStyle = (map: google.maps.Map, feature: google.maps.Data.Feature) => {
        changeStyle(map, feature, storageRef.current);
        props.onStyleChange();
    };

    const onMarkerClick = (event: google.maps.Data.MouseEvent) => {
        if (!props.map) return;
        if (draggedRef.current) return;

        switch (modeRef.current) {
            case 'route':
                props.onSelectedStopsChange(toggleRouteStop(selectedStopsRef.current, event.feature));
                return;
            case 'normal':
                if (isModifierPressed(event)) {
                    props.onEnterRouteMode(event.feature);
                } else if (selectedStopsRef.current[0] === event.feature) {
                    cycleStyle(props.map, event.feature);
                } else {
                    props.onSelectedStopsChange([event.feature]);
                }
                return;
        }
    };

    const onMarkerDoubleClick = (event: google.maps.Data.MouseEvent) => {
        if (!props.map) return;
        // A modifier + double-click is stopped here as well: its first click
        // already opened route mode.
        if (modeRef.current === 'route') return;
        cycleStyle(props.map, event.feature);
    };

    const onMarkerRightClick = (event: google.maps.Data.MouseEvent) => {
        if (!props.map) return;
        if (modeRef.current === 'route') {
            props.onSelectedStopsChange(cycleRouteNumber(selectedStopsRef.current, event.feature));
            return;
        }
        resetStyle(props.map, event.feature, storageRef.current);
        props.onSelectedStopsChange([]);
        props.onStyleChange();
    };

    return null; // This component doesn't render anything directly
}
