import { useEffect, useRef } from 'react';
import type { GoogleMap, Marker, MarkerSymbol } from '../google-maps-types';
import { fetchStations } from '../station';

// A small filled circle, not the pin shape PlanMarkers uses for planned
// stations: the two layers need to read apart at a glance, and this layer
// carries no status of its own for a color to encode. Built lazily (not at
// module scope) since it reads google.maps.SymbolPath, which only exists once
// the Maps script has loaded.
function existingStationIcon(): MarkerSymbol {
    return {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 4,
        fillColor: '#555555',
        fillOpacity: 0.9,
        strokeColor: '#ffffff',
        strokeWeight: 1,
    };
}

interface ExistingStationMarkersProps {
    map: GoogleMap | null;
    visible: boolean;
}

// Plots the already-open road stations (the same `stations.geojson` the main
// map reads) as a backdrop for the development plans, so the two can be
// compared by location. Read-only: no click handling, no visit status.
export function ExistingStationMarkers({ map, visible }: ExistingStationMarkersProps) {
    const markersRef = useRef<Marker[]>([]);
    // The fetch below is async, so a toggle made while it is in flight would
    // otherwise be missed: the closure over `visible` at effect-start time
    // would apply a stale value once the markers are actually created.
    const visibleRef = useRef(visible);
    useEffect(() => {
        visibleRef.current = visible;
    }, [visible]);

    useEffect(() => {
        if (!map) {
            return;
        }
        let cancelled = false;

        fetchStations()
            .then((stations) => {
                if (cancelled) {
                    return;
                }
                markersRef.current = stations.features.map((feature) => {
                    const [lng, lat] = feature.geometry.coordinates;
                    return new google.maps.Marker({
                        position: { lat, lng },
                        map,
                        title: feature.properties.name,
                        icon: existingStationIcon(),
                        visible: visibleRef.current,
                    });
                });
            })
            // This layer is a supplementary backdrop, not the map's core data;
            // failing to load it should not block or interrupt the rest of the
            // page, so just log it.
            .catch((error) => {
                console.error('Failed to load existing stations:', error);
            });

        return () => {
            cancelled = true;
            for (const marker of markersRef.current) {
                marker.setMap(null);
            }
            markersRef.current = [];
        };
    }, [map]);

    useEffect(() => {
        for (const marker of markersRef.current) {
            marker.setVisible(visible);
        }
    }, [visible]);

    return null;
}
