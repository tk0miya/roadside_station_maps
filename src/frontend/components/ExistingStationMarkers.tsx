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
        fillColor: '#ea4335',
        fillOpacity: 0.9,
        strokeColor: '#000000',
        strokeWeight: 1,
    };
}

interface ExistingStationMarkersProps {
    map: GoogleMap | null;
}

// Plots the already-open road stations (the same `stations.geojson` the main
// map reads) as a backdrop for the development plans, so the two can be
// compared by location. Read-only: no click handling, no visit status, always
// shown -- there is no toggle for this layer.
export function ExistingStationMarkers({ map }: ExistingStationMarkersProps) {
    const markersRef = useRef<Marker[]>([]);

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

    return null;
}
