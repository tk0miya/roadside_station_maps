import { useEffect, useRef } from 'react';
import type { Feature, GoogleMap, Icon, StyleOptions } from '../google-maps-types';
import { fetchStations } from '../station';

function existingStationIcon(): Icon {
    const size = 10;
    const center = size / 2;
    return {
        url: 'images/existing-station-dot.png',
        scaledSize: new google.maps.Size(size, size),
        anchor: new google.maps.Point(center, center),
    };
}

// Below this zoom the ~1200 dots are dense enough nationwide to bury the
// sparser plan pins under a solid field of red, so the backdrop only earns
// its keep once zoomed in past street/city scale.
const MIN_VISIBLE_ZOOM = 10;

interface ExistingStationMarkersProps {
    map: GoogleMap | null;
}

// Plots the already-open road stations (the same `stations.geojson` the main
// map reads) as a backdrop for the development plans, so the two can be
// compared by location. `clickable: false` keeps it out of the way of clicks
// (including the right-click PlanCoordCopy listens for on the map itself)
// instead of a dot absorbing them; visibility is zoom-gated only (see
// MIN_VISIBLE_ZOOM above), not a sidebar toggle.
//
// Renders through the map's Data layer with a single `addGeoJson`, not one
// google.maps.Marker per station: at ~1200 stations nationwide, a Marker per
// station is ~1200 separate DOM overlays for the browser to reposition on
// every zoom frame.
export function ExistingStationMarkers({ map }: ExistingStationMarkersProps) {
    const loadedRef = useRef(false);
    const lastVisibleRef = useRef<boolean | null>(null);

    useEffect(() => {
        if (!map) {
            return;
        }
        let cancelled = false;

        // Re-applying the style re-evaluates it for every one of the ~1200
        // features, so skip it on zoom changes that don't cross the
        // MIN_VISIBLE_ZOOM threshold.
        const applyStyle = (): void => {
            const visible = (map.getZoom() ?? 0) >= MIN_VISIBLE_ZOOM;
            if (lastVisibleRef.current === visible) {
                return;
            }
            lastVisibleRef.current = visible;
            map.data.setStyle((): StyleOptions => ({ icon: existingStationIcon(), clickable: false, visible }));
        };

        fetchStations()
            .then((stations) => {
                if (cancelled) {
                    return;
                }
                map.data.addGeoJson(stations);
                applyStyle();
                loadedRef.current = true;
            })
            // This layer is a supplementary backdrop, not the map's core data;
            // failing to load it should not block or interrupt the rest of the
            // page, so just log it.
            .catch((error) => {
                console.error('Failed to load existing stations:', error);
            });

        const zoomListener = map.addListener('zoom_changed', applyStyle);

        return () => {
            cancelled = true;
            zoomListener.remove();
            lastVisibleRef.current = null;
            if (!loadedRef.current) {
                return;
            }
            const features: Feature[] = [];
            map.data.forEach((feature) => {
                features.push(feature);
            });
            for (const feature of features) {
                map.data.remove(feature);
            }
            loadedRef.current = false;
        };
    }, [map]);

    return null;
}
