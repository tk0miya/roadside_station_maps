import { useEffect, useRef } from 'react';
import { addCustomStopAt, createCustomStop } from './components/RouteStops';
import type { MapMode } from './types/station-map';
import { isModifierPressed, useModifierHeld } from './use-modifier-held';

interface RouteModeShortcutProps {
    map: google.maps.Map | null;
    mode: MapMode;
    selectedStops: google.maps.Data.Feature[];
    onSelectedStopsChange: (next: google.maps.Data.Feature[]) => void;
    onEnterRouteMode: (seed: google.maps.Data.Feature) => void;
}

// Modifier (Cmd/Ctrl) + double-click on the map: one of the three ways into
// route mode, and "add a custom stop here" once already inside it. The two
// live together because they are one gesture read the same way regardless of
// mode — docs/station-map.md says why.
export function useRouteModeShortcut(props: RouteModeShortcutProps): void {
    // The listener is installed once, so what it reads has to come from a ref
    // rather than the render it was created in.
    const modeRef = useRef<MapMode>(props.mode);
    const selectedStopsRef = useRef<google.maps.Data.Feature[]>(props.selectedStops);
    const modifierHeld = useModifierHeld();

    useEffect(() => {
        modeRef.current = props.mode;
        selectedStopsRef.current = props.selectedStops;
    }, [props.mode, props.selectedStops]);

    // The modifier turns a double-click into "put a custom stop here", so the map
    // must not read the same gesture as a zoom-in while it is held. The mode is
    // deliberately not part of the answer — docs/station-map.md says why.
    useEffect(() => {
        props.map?.setOptions({ disableDoubleClickZoom: modifierHeld });
    }, [props.map, modifierHeld]);

    // The gesture on the map itself, as opposed to on a marker. One landing on
    // a marker never arrives here: the data layer takes that event.
    useEffect(() => {
        if (!props.map) return;

        const onMapDoubleClick = (event: google.maps.MapMouseEvent) => {
            if (!props.map) return;
            if (!isModifierPressed(event) || !event.latLng) return;
            if (modeRef.current === 'route') {
                const routeStops = addCustomStopAt(props.map, selectedStopsRef.current, event.latLng);
                if (routeStops) props.onSelectedStopsChange(routeStops);
                return;
            }
            props.onEnterRouteMode(createCustomStop(props.map, event.latLng));
        };

        const listener = props.map.addListener('dblclick', onMapDoubleClick);
        return () => listener.remove();
    }, [props.map]);
}
