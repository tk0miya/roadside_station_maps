import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { MARKER_ICONS } from '../marker-icons';
import type { Storage } from '../storage';
import { entries, STYLE_COUNT } from '../style';
import { StationsGeoJSON } from '../types/geojson';

interface StationCounterProps {
    storage: Storage;
    stations: StationsGeoJSON | null;
    styleVersion: number;
    map: google.maps.Map | null;
}

function countByStyle(storage: Storage, totalStations: number): Record<number, number> {
    const counts: Record<number, number> = {};
    for (let i = 0; i < STYLE_COUNT; i++) {
        counts[i] = 0;
    }

    for (const [, styleId] of entries(storage)) {
        counts[styleId]++;
    }

    // StyleId 0 = total stations - assigned stations
    const assignedCount = Object.values(counts).reduce((sum, count) => sum + count, 0) - counts[0];
    counts[0] = totalStations - assignedCount;

    return counts;
}

export function StationCounter({ storage, stations, styleVersion: _styleVersion, map }: StationCounterProps) {
    const contentElementRef = useRef<HTMLElement | null>(null);
    const contentRootRef = useRef<any>(null);

    useEffect(() => {
        if (!map) return;

        // Create counter container
        const element = document.createElement('div');
        element.className = 'station-counter';
        contentElementRef.current = element;

        const root = createRoot(element);
        contentRootRef.current = root;

        // Add to map controls
        const controls = map.controls[google.maps.ControlPosition.RIGHT_TOP];
        controls.push(element);

        return () => {
            const index = controls.getArray().indexOf(element);
            if (index >= 0) {
                controls.removeAt(index);
            }
            // Defer unmount to avoid synchronous unmount during React render
            setTimeout(() => root.unmount(), 0);
            contentElementRef.current = null;
            contentRootRef.current = null;
        };
    }, [map]);

    useEffect(() => {
        if (!contentRootRef.current || !stations) return;

        const totalStations = stations.features.length;
        const counts = countByStyle(storage, totalStations);

        // Render React content
        contentRootRef.current.render(
            <div>
                {MARKER_ICONS.map((icon, styleId) => (
                    <div key={styleId} className="station-counter-style">
                        <img src={icon} />
                        <span>{counts[styleId]}</span>
                    </div>
                ))}
            </div>
        );
    }, [stations, _styleVersion, storage]);

    return null; // This component doesn't render anything directly
}
