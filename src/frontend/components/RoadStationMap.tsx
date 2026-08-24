import { useEffect, useRef, useState } from 'react';
import { useAuthManager } from '../auth/auth-context';
import { useSessionRefresh } from '../auth/use-session-refresh';
import { isRouteFull } from '../route';
import { fetchStations, reconcileVisits } from '../station';
import { createStorage, type Storage } from '../storage';
import type { StationsGeoJSON } from '../types/geojson';
import type { MapMode } from '../types/station-map';
import { useRouteModeShortcut } from '../use-route-mode-shortcut';
import { InfoWindow } from './InfoWindow';
import { LoginButton } from './LoginButton';
import { Markers } from './Markers';
import { RouteControl } from './RouteControl';
import { addCustomStopAt, RouteStops } from './RouteStops';
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
    const [stations, setStations] = useState<StationsGeoJSON | null>(null);
    const [styleVersion, setStyleVersion] = useState(0);
    const [storage, setStorage] = useState<Storage | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [mode, setMode] = useState<MapMode>('normal');
    const [selectedStops, setSelectedStops] = useState<google.maps.Data.Feature[]>([]);
    // The map click listener is installed once, so what it reads about the mode
    // has to come from a ref rather than the render it was created in.
    const modeRef = useRef(mode);

    useEffect(() => {
        modeRef.current = mode;
    }, [mode]);

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

        map.addListener('click', () => {
            if (modeRef.current === 'route') return;
            // Handing `prev` back when nothing is open keeps the tap from
            // re-rendering.
            setSelectedStops((prev) => (prev.length ? [] : prev));
        });
        getCurrentPosition().then(onLocationDetected);
    }, [map]);

    const onLocationDetected = (pos: GeolocationPosition) => {
        if (map) {
            const latlng = new google.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
            map.setCenter(latlng);
        }
    };

    const enterRouteMode = (seed?: google.maps.Data.Feature) => {
        setMode('route');
        setSelectedStops(seed ? [seed] : []);
    };

    // The other two ways into route mode are the RouteControl switch and the
    // modifier + marker click, which is Markers' concern; this is the one
    // that reads the map itself. `map` is withheld until storage is ready, the
    // same gate Markers/RouteStops/RouteControl render behind, so the gesture
    // cannot open a route mode the UI isn't there yet to show.
    useRouteModeShortcut({
        map: storage ? map : null,
        mode,
        selectedStops,
        onSelectedStopsChange: setSelectedStops,
        onEnterRouteMode: enterRouteMode,
    });

    // Put a custom stop at the middle of the map, where the crosshair is. The
    // mode is checked here rather than left to the button that calls it, since
    // this writes a pick and nothing else vouches for the mode it is written in.
    const addCustomStopAtCrosshair = () => {
        const center = map?.getCenter();
        if (mode !== 'route' || !map || !center) return;
        const routeStops = addCustomStopAt(map, selectedStops, center);
        if (routeStops) setSelectedStops(routeStops);
    };

    const closeRoute = () => {
        setMode('normal');
        setSelectedStops([]);
    };

    const openStation = mode === 'normal' ? (selectedStops[0] ?? null) : null;

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
                        mode={mode}
                        selectedStops={selectedStops}
                        onSelectedStopsChange={setSelectedStops}
                        storage={storage}
                        stations={stations}
                        onStyleChange={() => setStyleVersion((v) => v + 1)}
                        onEnterRouteMode={enterRouteMode}
                    />
                    <RouteStops map={map} mode={mode} selectedStops={selectedStops} storage={storage} />
                    <ShareButton map={map} />
                    <StationCounter storage={storage} stations={stations} styleVersion={styleVersion} map={map} />
                    {/* Aimed at by panning the map, and shown only while there is
                        room for another stop. */}
                    {mode === 'route' && !isRouteFull(selectedStops) && (
                        <div className="route-crosshair" aria-hidden="true" />
                    )}
                    {/* Route mode rides on the markers: Markers puts stations on
                        the map and RouteStops numbers the chosen ones and takes
                        the custom stops off again, so there is no route to build
                        without them. */}
                    <RouteControl
                        map={map}
                        active={mode === 'route'}
                        routeStops={selectedStops}
                        onEnter={() => enterRouteMode()}
                        onAddCustomStop={addCustomStopAtCrosshair}
                        onClose={closeRoute}
                    />
                </>
            )}
            <InfoWindow selectedFeature={openStation} map={map} />
            <LoginButton map={map} />
        </>
    );
}
