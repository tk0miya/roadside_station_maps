import { useEffect, useRef, useState } from 'react';
import { useAuthManager } from '../auth/auth-context';
import { useSessionRefresh } from '../auth/use-session-refresh';
import { clearsSelectionOnMapClick, isRouteFull } from '../route';
import { fetchStations, reconcileVisits } from '../station';
import { createStorage, type Storage } from '../storage';
import type { StationsGeoJSON } from '../types/geojson';
import { InfoWindow } from './InfoWindow';
import { LoginButton } from './LoginButton';
import { dropRoutePoint, isModifierPressed, Markers } from './Markers';
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

    // The control stands in for the route: it is open while one is being
    // built, whether route mode or a modifier-click started it.
    const isRouteOpen = routeMode || multiSelected.length > 0;

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

        map.addListener('click', (event: google.maps.MapMouseEvent) => {
            const clears = clearsSelectionOnMapClick({
                modifierPressed: isModifierPressed(event),
                routeMode: routeModeRef.current,
            });
            if (!clears) return;
            setFeature(null);
            setMultiSelected([]);
        });
        getCurrentPosition().then(onLocationDetected);
    }, [map]);

    const onLocationDetected = (pos: GeolocationPosition) => {
        if (map) {
            const latlng = new google.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
            map.setCenter(latlng);
        }
    };

    // Entering route mode closes the info window: from here a tap on a marker
    // adds it to the route rather than opening it.
    const enterRouteMode = () => {
        setFeature(null);
        setRouteMode(true);
    };

    // Put a route point at the middle of the map, where the crosshair is.
    const addPointAtCenter = () => {
        const center = map?.getCenter();
        if (!map || !center) return;
        const result = dropRoutePoint(map, center, { selectedFeature: feature, multiSelected });
        if (!result) return;
        if (result.selectedFeature !== undefined) setFeature(result.selectedFeature);
        if (result.multiSelected !== undefined) setMultiSelected(result.multiSelected);
    };

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
                    />
                    <ShareButton map={map} />
                    <StationCounter storage={storage} stations={stations} styleVersion={styleVersion} map={map} />
                    {/* Aimed at by panning the map, and shown only while there is
                        room for another point. */}
                    {isRouteOpen && !isRouteFull(multiSelected) && (
                        <div className="route-crosshair" aria-hidden="true" />
                    )}
                    {/* Route mode rides on the markers: Markers puts them on the
                        map, numbers the chosen ones and takes the dropped points
                        off again, so there is no route to build without it. */}
                    <RouteControl
                        map={map}
                        active={isRouteOpen}
                        stops={multiSelected}
                        onEnter={enterRouteMode}
                        onAddPoint={addPointAtCenter}
                        onClose={closeRoute}
                    />
                </>
            )}
            <InfoWindow selectedFeature={multiSelected.length > 0 ? null : feature} map={map} />
            <LoginButton map={map} />
        </>
    );
}
