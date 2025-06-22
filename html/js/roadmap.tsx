import React from 'react';
const { useEffect, useRef, useState } = React;
import { InfoWindow } from './components/InfoWindow';
import { ClipboardButton } from './components/ClipboardButton';
import { Markers } from './components/Markers';

export var RoadStationMap = function() {
    const mapContainerRef = useRef<HTMLDivElement | null>(null);
    const [map, setMap] = useState<google.maps.Map | null>(null);
    const [feature, setFeature] = useState<google.maps.Data.Feature | null>(null);

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

        map.addListener("click", () => setFeature(null));
        navigator.geolocation.getCurrentPosition(pos => onCurrentPositionGot(pos, map));
    }, [map]);
    const onCurrentPositionGot = (pos: GeolocationPosition, map: google.maps.Map) => {
        var latlng = new google.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
        map.setCenter(latlng);
    };

    return (
        <>
            <div ref={mapContainerRef} className="map-canvas" />
            <Markers
                map={map}
                selectedFeature={feature}
                onFeatureSelect={setFeature}
            />
            <InfoWindow
                selectedFeature={feature}
                map={map}
            />
            <ClipboardButton map={map} />
        </>
    );
};

