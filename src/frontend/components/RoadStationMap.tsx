import { useEffect, useRef, useState } from 'react';
import { useAuthManager } from '../auth/auth-context';
import { useSessionRefresh } from '../auth/use-session-refresh';
import { isRouteFull } from '../route';
import { fetchStations, reconcileVisits } from '../station';
import { createStorage, type Storage } from '../storage';
import type { StationsGeoJSON } from '../types/geojson';
import { InfoWindow } from './InfoWindow';
import { LoginButton } from './LoginButton';
import { dropRoutePoint, Markers } from './Markers';
import { RouteControl } from './RouteControl';
import { ShareButton } from './ShareButton';
import { StationCounter } from './StationCounter';

const getCurrentPosition = (): Promise<GeolocationPosition> => {
    return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(resolve);
    });
};

export function RoadStationMap() {
    const authManager = useAuthManager();
    const auth = authManager.getState();
    useSessionRefresh(authManager);
    const mapContainerRef = useRef<HTMLDivElement | null>(null);
    const [map, setMap] = useState<google.maps.Map | null>(null);
    const [feature, setFeature] = useState<google.maps.Data.Feature | null>(null);
    const [multiSelected, setMultiSelected] = useState<google.maps.Data.Feature[]>([]);
    const [stations, setStations] = useState<StationsGeoJSON | null>(null);
    const [styleVersion, setStyleVersion] = useState(0);
    const [storage, setStorage] = useState<Storage | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [routeMode, setRouteMode] = useState(false);
    // The map click listener is installed once, so what it reads about route
    // mode has to come from a ref rather than the render it was created in.
    const routeModeRef = useRef(routeMode);

    useEffect(() => {
        routeModeRef.current = routeMode;
    }, [routeMode]);

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
            .catch((error) => setLoadError(error instanceof Error ? error.message : String(error)));
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

        createStorage({ getSessionToken: () => authManager.getState().sessionToken })
            .then((newStorage) => {
                if (cancelled) return;
                setStorage(newStorage);
            })
            .catch((error) => {
                if (cancelled) return;
                setLoadError(error instanceof Error ? error.message : String(error));
            });

        return () => {
            cancelled = true;
        };
    }, [auth.sessionToken, authManager]);

    // Drop stored visits for stations that no longer exist once both are ready.
    useEffect(() => {
        if (!storage || !stations) return;
        reconcileVisits(storage, stations);
        setStyleVersion((v) => v + 1);
    }, [storage, stations]);

    useEffect(() => {
        if (!map) return;

        // A tap on the map puts the open station away. In route mode it does
        // nothing at all — the mode answers markers and its own control, not the
        // ground between them — and the guard says so even though route mode
        // leaves no open station for it to put away.
        map.addListener('click', () => {
            if (routeModeRef.current) return;
            setFeature(null);
        });
        getCurrentPosition().then(onLocationDetected);
    }, [map]);

    const onLocationDetected = (pos: GeolocationPosition) => {
        if (map) {
            const latlng = new google.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
            map.setCenter(latlng);
        }
    };

    // Open route mode. `seed` is the stop the way in came with — the switch
    // brings none and starts an empty route, the modifier gestures bring the
    // station or the point they landed on. Either way the info window closes:
    // from here a tap on a marker adds it to the route rather than opening it.
    const enterRouteMode = (seed?: google.maps.Data.Feature) => {
        setFeature(null);
        setMultiSelected(seed ? [seed] : []);
        setRouteMode(true);
    };

    // Put a route point at the middle of the map, where the crosshair is.
    const addPointAtCenter = () => {
        const center = map?.getCenter();
        if (!map || !center) return;
        const route = dropRoutePoint(map, center, multiSelected);
        if (route) setMultiSelected(route);
    };

    // Leave route mode. The route lives exactly as long as the mode, so it goes
    // with it.
    const closeRoute = () => {
        setRouteMode(false);
        setMultiSelected([]);
    };

    return (
        <>
            <div ref={mapContainerRef} className="map-canvas" />
            {!storage && !loadError && <div className="loading-overlay">訪問履歴を読み込み中...</div>}
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
                        multiSelected={multiSelected}
                        onMultiSelectChange={setMultiSelected}
                        storage={storage}
                        stations={stations}
                        onStyleChange={() => setStyleVersion((v) => v + 1)}
                        routeMode={routeMode}
                        onEnterRouteMode={enterRouteMode}
                    />
                    <ShareButton map={map} />
                    <StationCounter storage={storage} stations={stations} styleVersion={styleVersion} map={map} />
                    {/* Aimed at by panning the map, and shown only while there is
                        room for another point. */}
                    {routeMode && !isRouteFull(multiSelected) && <div className="route-crosshair" aria-hidden="true" />}
                    {/* Route mode rides on the markers: Markers puts them on the
                        map, numbers the chosen ones and takes the dropped points
                        off again, so there is no route to build without it. */}
                    <RouteControl
                        map={map}
                        active={routeMode}
                        stops={multiSelected}
                        onEnter={() => enterRouteMode()}
                        onAddPoint={addPointAtCenter}
                        onClose={closeRoute}
                    />
                </>
            )}
            <InfoWindow selectedFeature={feature} map={map} />
            <LoginButton map={map} />
        </>
    );
}
