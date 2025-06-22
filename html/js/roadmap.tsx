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
    const [map, setMap] = useState<google.maps.Map | null>(null);
    const [feature, setFeature] = useState<google.maps.Data.Feature | null>(null);
    const featureRef = useRef<google.maps.Data.Feature | null>(null);

    useEffect(() => {
        featureRef.current = feature;
    }, [feature]);

    useEffect(() => {
        if (mapContainerRef.current) {
            const mapInstance = new google.maps.Map(mapContainerRef.current, {
                center: { lat: 35.6896342, lng: 139.6921007 }, // Shinjuku, Tokyo
                zoom: 9
            });
            setMap(mapInstance);
        }
    }, []);

    useEffect(() => {
        if (!map) return;

        fetch('../data/stations.geojson')
            .then(response => response.json())
            .then(data => onGeoJSONLoaded(data, map))
            .catch(error => console.error('Error loading GeoJSON:', error));
        
        navigator.geolocation.getCurrentPosition(pos => onCurrentPositionGot(pos, map));
    }, [map]);


    const onGeoJSONLoaded = (data: object, mapInstance: google.maps.Map) => {
        mapInstance.addListener("click", onMapClicked);
        mapInstance.data.addGeoJson(data);
        mapInstance.data.addListener('click', onMarkerClicked);
        mapInstance.data.addListener('dblclick', onMarkerDoubleClicked);
        mapInstance.data.setStyle(function(feature: google.maps.Data.Feature) {
            return createRoadStation(feature).getStyle();
        });
    };
    const onCurrentPositionGot = (pos: GeolocationPosition, mapInstance: google.maps.Map) => {
        var latlng = new google.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
        mapInstance.setCenter(latlng);
    };
    const onMapClicked = () => {
        setFeature(null);
    };

    const onMarkerClicked = (event: google.maps.Data.MouseEvent) => {
        if (map && featureRef.current === event.feature) {
            var station = createRoadStation(event.feature);
            map.data.overrideStyle(event.feature, station.changeStyle());
        } else {
            setFeature(event.feature);
        }
    };

    const onMarkerDoubleClicked = (event: google.maps.Data.MouseEvent) => {
        if (map) {
            var station = createRoadStation(event.feature);
            map.data.overrideStyle(event.feature, station.changeStyle());
            setFeature(null);
        }
    };

    return (
        <>
            <div ref={mapContainerRef} className="map-canvas" />
            <InfoWindow
                feature={feature}
                map={map}
            />
            <ClipboardButton map={map} />
        </>
    );
};

