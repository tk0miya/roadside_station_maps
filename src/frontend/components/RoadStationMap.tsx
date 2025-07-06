import { useEffect, useRef, useState } from 'react';
import { InfoWindow } from './InfoWindow';
import { ClipboardButton } from './ClipboardButton';
import { Markers } from './Markers';
import { StationCounter } from './StationCounter';
import { getStyleManagerInstance } from '../style-manager';
import { StationsGeoJSON } from '../types/geojson';

const getCurrentPosition = (): Promise<GeolocationPosition> => {
    return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(resolve);
    });
};

export function RoadStationMap() {
    const mapContainerRef = useRef<HTMLDivElement | null>(null);
    const [map, setMap] = useState<google.maps.Map | null>(null);
    const [feature, setFeature] = useState<google.maps.Data.Feature | null>(null);
    const [stations, setStations] = useState<StationsGeoJSON | null>(null);
    const [styleVersion, setStyleVersion] = useState(0);
    const styleManagerRef = useRef(getStyleManagerInstance());

    useEffect(() => {
        if (mapContainerRef.current) {
            const mapInstance = new google.maps.Map(mapContainerRef.current, {
                center: { lat: 35.6896342, lng: 139.6921007 }, // Shinjuku, Tokyo
                zoom: 9,
                fullscreenControl: false,
                cameraControl: false
            });
            setMap(mapInstance);
        }
    }, []);

    // Fetch stations data once
    useEffect(() => {
        const fetchStations = async () => {
            try {
                const response = await fetch('../data/stations.geojson');
                const data = await response.json();
                styleManagerRef.current.setStations(data);
                setStations(data);
            } catch (error) {
                console.error('Error fetching stations:', error);
            }
        };
        fetchStations();
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
                styleManager={styleManagerRef.current}
                stations={stations}
                onStyleChange={() => setStyleVersion(v => v + 1)}
            />
            <InfoWindow
                selectedFeature={feature}
                map={map}
            />
            <ClipboardButton map={map} styleManager={styleManagerRef.current} />
            <StationCounter
                styleManager={styleManagerRef.current}
                stations={stations}
                styleVersion={styleVersion}
                map={map}
            />
        </>
    );
};

