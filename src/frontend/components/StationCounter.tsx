import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { StyleManager, STYLES } from '../style-manager';
import { StationsGeoJSON } from '../types/geojson';

interface StationCounterProps {
    styleManager: StyleManager;
    stations: StationsGeoJSON | null;
    styleVersion: number;
    map: google.maps.Map | null;
}

export function StationCounter({ styleManager, stations, styleVersion: _styleVersion, map }: StationCounterProps) {
    const contentElementRef = useRef<HTMLElement | null>(null);
    const contentRootRef = useRef<any>(null);

    useEffect(() => {
        if (!map) return;

        // Create counter container
        contentElementRef.current = document.createElement('div');
        contentElementRef.current.className = 'station-counter';
        
        contentRootRef.current = createRoot(contentElementRef.current);

        // Add to map controls
        map.controls[google.maps.ControlPosition.TOP_RIGHT].push(contentElementRef.current);
    }, [map]);

    useEffect(() => {
        if (!contentRootRef.current || !stations) return;

        const totalStations = stations.features.length;
        const counts = styleManager.countByStyle(totalStations);

        // Render React content
        contentRootRef.current.render(
            <div>
                {[0, 1, 2, 3, 4].map((styleId) => {
                    const icon = STYLES[styleId].icon as string;
                    const count = counts[styleId];
                    return (
                        <div key={styleId} className="station-counter-style">
                            <img src={icon} />
                            <span>{count}</span>
                        </div>
                    );
                })}
            </div>
        );
    }, [stations, _styleVersion, styleManager]);

    return null; // This component doesn't render anything directly
}