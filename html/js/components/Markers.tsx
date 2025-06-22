import { useEffect, useRef } from 'react';
import queryString from 'query-string';

import { createRoadStation as createQueriesRoadStation } from '../roadstation/queries';
import { createRoadStation as createLocalStorageRoadStation } from '../roadstation/localstorage';

var queries = queryString.parse(location.search);
var createRoadStation = queries.mode == 'shared'
    ? createQueriesRoadStation(queries)
    : createLocalStorageRoadStation;

interface MarkersProps {
    map: google.maps.Map | null;
    selectedFeature: google.maps.Data.Feature | null;
    onFeatureSelect: (feature: google.maps.Data.Feature | null) => void;
}

export var Markers = function(props: MarkersProps) {
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
            props.map!.data.setStyle(function(feature: google.maps.Data.Feature) {
                return createRoadStation(feature).getStyle();
            });
        };

        loadGeoJSON();
    }, [props.map]);

    const onMarkerClick = (event: google.maps.Data.MouseEvent) => {
        if (props.map && selectedFeatureRef.current === event.feature) {
            var station = createRoadStation(event.feature);
            props.map.data.overrideStyle(event.feature, station.changeStyle());
        } else {
            props.onFeatureSelect(event.feature);
        }
    };

    const onMarkerDoubleClick = (event: google.maps.Data.MouseEvent) => {
        if (props.map) {
            var station = createRoadStation(event.feature);
            props.map.data.overrideStyle(event.feature, station.changeStyle());
            props.onFeatureSelect(null);
        }
    };

    return null; // This component doesn't render anything directly
};
