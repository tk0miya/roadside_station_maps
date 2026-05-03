import { useEffect, useRef } from 'react';

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

    const onMarkerClick = (event: google.maps.Data.MouseEvent) => {
        if (props.map && selectedFeatureRef.current === event.feature) {
            const stationId = event.feature.getProperty('stationId') as string;
            const newStyleId = changeStyle(storageRef.current, stationId);
            props.map.data.overrideStyle(event.feature, styleOptionsFor(newStyleId));
            props.onStyleChange();
        } else {
            props.onFeatureSelect(event.feature);
        }
    };

    const onMarkerDoubleClick = (event: google.maps.Data.MouseEvent) => {
        if (props.map) {
            const stationId = event.feature.getProperty('stationId') as string;
            const newStyleId = changeStyle(storageRef.current, stationId);
            props.map.data.overrideStyle(event.feature, styleOptionsFor(newStyleId));
            props.onStyleChange();
        }
    };

    const onMarkerRightClick = (event: google.maps.Data.MouseEvent) => {
        if (props.map) {
            const stationId = event.feature.getProperty('stationId') as string;
            const newStyleId = resetStyle(storageRef.current, stationId);
            props.map.data.overrideStyle(event.feature, styleOptionsFor(newStyleId));
            props.onFeatureSelect(null);
            props.onStyleChange();
        }
    };

    return null; // This component doesn't render anything directly
}
