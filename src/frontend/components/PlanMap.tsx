import { useCallback, useEffect, useRef, useState } from 'react';
import { PlannedStationsApiClient } from '../storage/planned-stations-api-client';
import type { Category, PlannedStation } from '../types/plan';
import { PlanInfoWindow } from './PlanInfoWindow';
import { PlanMarkers } from './PlanMarkers';
import { PlanSidebar } from './PlanSidebar';

// Default visibility: focus on upcoming stations, so 開業 (already open) and
// 中止 (cancelled) start hidden. Users can toggle them on in the sidebar.
const DEFAULT_VISIBLE: Record<Category, boolean> = {
    開業: false,
    登録済み: true,
    '計画中(予定あり)': true,
    '計画中(未定)': true,
    中止: false,
};

// Zoom applied when a station is chosen from the sidebar (only when the map is
// currently zoomed out more than this). Higher = closer; 8 shows the station
// with a good amount of surrounding context.
const SELECT_ZOOM = 8;

// Orchestrates the development-plan map: creates the map, loads the planned
// stations, and holds the selection / category-visibility state.
export function PlanMap() {
    const mapContainerRef = useRef<HTMLDivElement | null>(null);
    const [map, setMap] = useState<google.maps.Map | null>(null);
    const [stations, setStations] = useState<PlannedStation[]>([]);
    const [selected, setSelected] = useState<PlannedStation | null>(null);
    const [visibleCategories, setVisibleCategories] =
        useState<Record<Category, boolean>>(DEFAULT_VISIBLE);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        if (mapContainerRef.current) {
            const mapInstance = new google.maps.Map(mapContainerRef.current, {
                center: { lat: 37.5, lng: 137.5 },
                zoom: 6,
                mapTypeControl: false,
                streetViewControl: false,
                fullscreenControl: false,
            });
            mapInstance.addListener('click', () => setSelected(null));
            setMap(mapInstance);
        }
    }, []);

    useEffect(() => {
        new PlannedStationsApiClient()
            .list()
            .then(setStations)
            .catch((error) => setLoadError(error instanceof Error ? error.message : String(error)));
    }, []);

    const toggle = useCallback((category: Category) => {
        setVisibleCategories((prev) => ({ ...prev, [category]: !prev[category] }));
    }, []);

    // Select from the sidebar: also pan (and gently zoom in) to the station.
    const focusStation = useCallback(
        (station: PlannedStation) => {
            setSelected(station);
            if (map && station.lat !== null && station.lng !== null) {
                map.panTo({ lat: station.lat, lng: station.lng });
                if ((map.getZoom() ?? 0) < SELECT_ZOOM) {
                    map.setZoom(SELECT_ZOOM);
                }
            }
        },
        [map],
    );

    return (
        <div className="plan-layout">
            <PlanSidebar
                stations={stations}
                visibleCategories={visibleCategories}
                selected={selected}
                onToggle={toggle}
                onSelect={focusStation}
            />
            <div className="plan-map-area">
                <div ref={mapContainerRef} className="map-canvas" />
                {loadError && (
                    <div className="loading-overlay loading-overlay-error">
                        データの読み込みに失敗しました: {loadError}
                    </div>
                )}
                <PlanMarkers
                    map={map}
                    stations={stations}
                    visibleCategories={visibleCategories}
                    onSelect={setSelected}
                />
                <PlanInfoWindow map={map} selected={selected} />
            </div>
        </div>
    );
}
