import { useEffect, useRef, useState } from 'react';
import { InfoWindow } from './InfoWindow';
import { ClipboardButton } from './ClipboardButton';
import { Markers } from './Markers';
import { getStyleManagerInstance } from '../style-manager';

const getCurrentPosition = (): Promise<GeolocationPosition> => {
    return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(resolve);
    });
};

export function RoadStationMap() {
    const mapContainerRef = useRef<HTMLDivElement | null>(null);
    const [map, setMap] = useState<google.maps.Map | null>(null);
    const [feature, setFeature] = useState<google.maps.Data.Feature | null>(null);
    const styleManager = getStyleManagerInstance();

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
        getCurrentPosition().then(onLocationDetected);
    }, [map]);

    const onLocationDetected = (pos: GeolocationPosition) => {
        if (map) {
            const latlng = new google.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
            map.setCenter(latlng);
        }
    };

    return (
        <>
            <div ref={mapContainerRef} className="map-canvas" />
            <Markers
                map={map}
                selectedFeature={feature}
                onFeatureSelect={setFeature}
                styleManager={styleManager}
            />
            <InfoWindow
                selectedFeature={feature}
                map={map}
            />
            <ClipboardButton map={map} />
        </>
    );
};

