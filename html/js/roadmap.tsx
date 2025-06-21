import React from 'react';
const { useEffect, useRef, useState } = React;
import queryString from 'query-string';
import { InfoWindow } from './components/InfoWindow';
import { ClipboardButton } from './components/ClipboardButton';

import { createRoadStation as createQueriesRoadStation } from './roadstation/queries';
import { createRoadStation as createLocalStorageRoadStation } from './roadstation/localstorage';

var queries = queryString.parse(location.search);
var createRoadStation = queries.mode == 'shared'
    ? createQueriesRoadStation(queries)
    : createLocalStorageRoadStation;

export var RoadStationMap = function() {
    const mapContainerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<google.maps.Map | null>(null);
    const [feature, setFeature] = useState<google.maps.Data.Feature | null>(null);
    const featureRef = useRef<google.maps.Data.Feature | null>(null);

    useEffect(() => {
        featureRef.current = feature;
    }, [feature]);

    useEffect(() => {
        if (mapContainerRef.current) {
            mapRef.current = new google.maps.Map(mapContainerRef.current, {
                center: { lat: 35.6896342, lng: 139.6921007 }, // Shinjuku, Tokyo
                zoom: 9
            });

            fetch('../data/stations.geojson')
                .then(response => response.json())
                .then(onGeoJSONLoaded)
                .catch(error => console.error('Error loading GeoJSON:', error));
            navigator.geolocation.getCurrentPosition(onCurrentPositionGot);
        }
    }, []);


    const onGeoJSONLoaded = (data: object) => {
        if (mapRef.current) {
            mapRef.current.addListener("click", onMapClicked);
            mapRef.current.data.addGeoJson(data);
            mapRef.current.data.addListener('click', onMarkerClicked);
            mapRef.current.data.addListener('dblclick', onMarkerDoubleClicked);
            mapRef.current.data.setStyle(function(feature: google.maps.Data.Feature) {
                return createRoadStation(feature).getStyle();
            });
        }
    };
    const onCurrentPositionGot = (pos: GeolocationPosition) => {
        if (mapRef.current) {
            var latlng = new google.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
            mapRef.current.setCenter(latlng);
        }
    };
    const onMapClicked = () => {
        setFeature(null);
    };

    const onMarkerClicked = (event: google.maps.Data.MouseEvent) => {
        if (mapRef.current && featureRef.current === event.feature) {
            var station = createRoadStation(event.feature);
            mapRef.current.data.overrideStyle(event.feature, station.changeStyle());
        } else {
            setFeature(event.feature);
        }
    };

    const onMarkerDoubleClicked = (event: google.maps.Data.MouseEvent) => {
        if (mapRef.current) {
            var station = createRoadStation(event.feature);
            mapRef.current.data.overrideStyle(event.feature, station.changeStyle());
            setFeature(null);
        }
    };

    return (
        <>
            <div ref={mapContainerRef} className="map-canvas" />
            {mapRef.current && (
                <>
                    <InfoWindow
                        feature={feature}
                        map={mapRef.current}
                    />
                    <ClipboardButton map={mapRef.current} />
                </>
            )}
        </>
    );
};

