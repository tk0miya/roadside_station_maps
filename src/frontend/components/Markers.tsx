import { useEffect, useRef } from 'react';

import { createRoadStation } from '../road-station';
import { StyleManager } from '../style-manager';

interface MarkersProps {
    map: google.maps.Map | null;
    selectedFeature: google.maps.Data.Feature | null;
    onFeatureSelect: (feature: google.maps.Data.Feature | null) => void;
    styleManager: StyleManager;
}

export function Markers(props: MarkersProps) {
    const selectedFeatureRef = useRef<google.maps.Data.Feature | null>(null);

    useEffect(() => {
        selectedFeatureRef.current = props.selectedFeature;
    }, [props.selectedFeature]);

    useEffect(() => {
        if (!props.map) return;

        const loadGeoJSON = async () => {
            const response = await fetch('../data/stations.geojson');
            const stations = await response.json();
            
            // Set up markers
            props.map!.data.addGeoJson(stations);
            props.map!.data.addListener('click', onMarkerClick);
            props.map!.data.addListener('dblclick', onMarkerDoubleClick);
            props.map!.data.addListener('rightclick', onMarkerRightClick);
            props.map!.data.setStyle((feature: google.maps.Data.Feature) => {
                const station = createRoadStation(feature);
                return props.styleManager.getStyle(station);
            });
        };

        loadGeoJSON();
    }, [props.map]);

    const onMarkerClick = (event: google.maps.Data.MouseEvent) => {
        if (props.map && selectedFeatureRef.current === event.feature) {
            const station = createRoadStation(event.feature);
            const newStyle = props.styleManager.changeStyle(station);
            props.map.data.overrideStyle(event.feature, newStyle);
        } else {
            props.onFeatureSelect(event.feature);
        }
    };

    const onMarkerDoubleClick = (event: google.maps.Data.MouseEvent) => {
        if (props.map) {
            const station = createRoadStation(event.feature);
            const newStyle = props.styleManager.changeStyle(station);
            props.map.data.overrideStyle(event.feature, newStyle);
            props.onFeatureSelect(null);
        }
    };

    const onMarkerRightClick = (event: google.maps.Data.MouseEvent) => {
        if (props.map) {
            const station = createRoadStation(event.feature);
            const resetStyle = props.styleManager.resetStyle(station);
            props.map.data.overrideStyle(event.feature, resetStyle);
            props.onFeatureSelect(null);
        }
    };

    return null; // This component doesn't render anything directly
};
