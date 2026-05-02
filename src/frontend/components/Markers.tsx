import { useEffect, useRef } from 'react';

import { createRoadStation } from '../road-station';
import { MARKER_ICONS } from '../marker-icons';
import type { Storage } from '../storage';
import { changeStyle, getStyle, resetStyle } from '../style';
import { StationsGeoJSON } from '../types/geojson';

const styleOptionsFor = (styleId: number): google.maps.Data.StyleOptions => ({
    icon: MARKER_ICONS[styleId],
});

interface MarkersProps {
    map: google.maps.Map | null;
    selectedFeature: google.maps.Data.Feature | null;
    onFeatureSelect: (feature: google.maps.Data.Feature | null) => void;
    storage: Storage;
    stations: StationsGeoJSON | null;
    onStyleChange: () => void;
}

export function Markers(props: MarkersProps) {
    const selectedFeatureRef = useRef<google.maps.Data.Feature | null>(null);
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
            const station = createRoadStation(feature);
            return styleOptionsFor(getStyle(storageRef.current, station));
        });
    }, [props.map, props.storage]);

    useEffect(() => {
        if (!props.map || !props.stations) return;

        props.map.data.addGeoJson(props.stations);
        const clickListener = props.map.data.addListener('click', onMarkerClick);
        const doubleClickListener = props.map.data.addListener('dblclick', onMarkerDoubleClick);
        const rightClickListener = props.map.data.addListener('rightclick', onMarkerRightClick);
        props.map.data.setStyle((feature: google.maps.Data.Feature) => {
            const station = createRoadStation(feature);
            return styleOptionsFor(getStyle(storageRef.current, station));
        });

        return () => {
            clickListener.remove();
            doubleClickListener.remove();
            rightClickListener.remove();
        };
    }, [props.map, props.stations]);

    const onMarkerClick = (event: google.maps.Data.MouseEvent) => {
        if (props.map && selectedFeatureRef.current === event.feature) {
            const station = createRoadStation(event.feature);
            const newStyleId = changeStyle(storageRef.current, station);
            props.map.data.overrideStyle(event.feature, styleOptionsFor(newStyleId));
            props.onStyleChange();
        } else {
            props.onFeatureSelect(event.feature);
        }
    };

    const onMarkerDoubleClick = (event: google.maps.Data.MouseEvent) => {
        if (props.map) {
            const station = createRoadStation(event.feature);
            const newStyleId = changeStyle(storageRef.current, station);
            props.map.data.overrideStyle(event.feature, styleOptionsFor(newStyleId));
            props.onStyleChange();
        }
    };

    const onMarkerRightClick = (event: google.maps.Data.MouseEvent) => {
        if (props.map) {
            const station = createRoadStation(event.feature);
            const newStyleId = resetStyle(storageRef.current, station);
            props.map.data.overrideStyle(event.feature, styleOptionsFor(newStyleId));
            props.onFeatureSelect(null);
            props.onStyleChange();
        }
    };

    return null; // This component doesn't render anything directly
}
