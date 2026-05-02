import { useEffect, useRef, useState } from 'react';
import { useAuthManager } from '../auth/auth-context';
import { RemoteStorage } from '../storage/remote-storage';
import { type StyleManager, createStyleManager } from '../style-manager';
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
    const [styleManager, setStyleManager] = useState<StyleManager | null>(null);
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
        const fetchStations = async () => {
            try {
                const response = await fetch('../data/stations.geojson');
                const data = await response.json();
                setStations(data);
            } catch (error) {
                console.error('Error fetching stations:', error);
            }
        };
        fetchStations();
    }, []);

    // Build the StyleManager whenever the auth state changes. RemoteStorage hydrates
    // asynchronously when signed in; MemoryStorage resolves immediately.
    useEffect(() => {
        let cancelled = false;
        setStyleManager((previous) => {
            if (previous?.storage instanceof RemoteStorage) {
                void previous.storage.flush();
            }
            return null;
        });
        setLoadError(null);

        createStyleManager({
            authState: auth,
            getIdToken: () => authManager.getState().idToken,
            onSyncError: (error) => {
                console.error('Failed to sync visit:', error);
            },
        })
            .then((manager) => {
                if (cancelled) return;
                setStyleManager(manager);
            })
            .catch((error) => {
                if (cancelled) return;
                console.error('Failed to create StyleManager:', error);
                setLoadError(error instanceof Error ? error.message : String(error));
            });

        return () => {
            cancelled = true;
        };
    }, [auth.idToken, authManager]);

    // Apply the station list to the StyleManager once both are ready.
    useEffect(() => {
        if (!styleManager || !stations) return;
        styleManager.setStations(stations);
        setStyleVersion((v) => v + 1);
    }, [styleManager, stations]);

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
            {!styleManager && !loadError && (
                <div className="loading-overlay">訪問履歴を読み込み中...</div>
            )}
            {loadError && (
                <div className="loading-overlay loading-overlay-error">
                    訪問履歴の読み込みに失敗しました: {loadError}
                </div>
            )}
            {styleManager && (
                <>
                    <Markers
                        map={map}
                        selectedFeature={feature}
                        onFeatureSelect={setFeature}
                        styleManager={styleManager}
                        stations={stations}
                        onStyleChange={() => setStyleVersion((v) => v + 1)}
                    />
                    <ShareButton map={map} />
                    <StationCounter
                        styleManager={styleManager}
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
