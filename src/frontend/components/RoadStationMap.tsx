import { useEffect, useRef, useState } from 'react';
import { useAuthManager } from '../auth/auth-context';
import { fetchStations, reconcileVisits } from '../station';
import { createStorage, type Storage } from '../storage';
import { StationsGeoJSON } from '../types/geojson';
import { ShareButton } from './ShareButton';
import { InfoWindow } from './InfoWindow';
import { LoginButton } from './LoginButton';
import { Markers } from './Markers';
import { StationCounter } from './StationCounter';

const getCurrentPosition = (): Promise<GeolocationPosition> => {
    return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(resolve);
    });
};

export function RoadStationMap() {
    const authManager = useAuthManager();
    const auth = authManager.getState();
    const mapContainerRef = useRef<HTMLDivElement | null>(null);
    const [map, setMap] = useState<google.maps.Map | null>(null);
    const [feature, setFeature] = useState<google.maps.Data.Feature | null>(null);
    const [stations, setStations] = useState<StationsGeoJSON | null>(null);
    const [styleVersion, setStyleVersion] = useState(0);
    const [storage, setStorage] = useState<Storage | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        if (mapContainerRef.current) {
            const mapInstance = new google.maps.Map(mapContainerRef.current, {
                center: { lat: 35.6896342, lng: 139.6921007 }, // Shinjuku, Tokyo
                zoom: 9,
                fullscreenControl: false,
                cameraControl: false,
            });
            setMap(mapInstance);
        }
    }, []);

    // Fetch stations data once
    useEffect(() => {
        fetchStations()
            .then(setStations)
            .catch((error) => console.error('Error fetching stations:', error));
    }, []);

    // Build the Storage whenever the auth state changes. RemoteStorage hydrates
    // asynchronously when signed in; MemoryStorage resolves immediately.
    useEffect(() => {
        let cancelled = false;
        setStorage((previous) => {
            void previous?.flush();
            return null;
        });
        setLoadError(null);

        createStorage({
            authState: auth,
            getIdToken: () => authManager.getState().idToken,
        })
            .then((newStorage) => {
                if (cancelled) return;
                setStorage(newStorage);
            })
            .catch((error) => {
                if (cancelled) return;
                console.error('Failed to create storage:', error);
                setLoadError(error instanceof Error ? error.message : String(error));
            });

        return () => {
            cancelled = true;
        };
    }, [auth.idToken, authManager]);

    // Drop stored visits for stations that no longer exist once both are ready.
    useEffect(() => {
        if (!storage || !stations) return;
        reconcileVisits(storage, stations);
        setStyleVersion((v) => v + 1);
    }, [storage, stations]);

    useEffect(() => {
        if (!map) return;

        map.addListener('click', () => setFeature(null));
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
            {!storage && !loadError && (
                <div className="loading-overlay">訪問履歴を読み込み中...</div>
            )}
            {loadError && (
                <div className="loading-overlay loading-overlay-error">
                    訪問履歴の読み込みに失敗しました: {loadError}
                </div>
            )}
            {storage && (
                <>
                    <Markers
                        map={map}
                        selectedFeature={feature}
                        onFeatureSelect={setFeature}
                        storage={storage}
                        stations={stations}
                        onStyleChange={() => setStyleVersion((v) => v + 1)}
                    />
                    <ShareButton map={map} />
                    <StationCounter
                        storage={storage}
                        stations={stations}
                        styleVersion={styleVersion}
                        map={map}
                    />
                </>
            )}
            <InfoWindow selectedFeature={feature} map={map} />
            <LoginButton map={map} />
        </>
    );
}
