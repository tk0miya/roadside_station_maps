import { useEffect, useRef } from 'react';
import { MARKER_ICONS } from '../marker-icons';
import type { Category, PlannedStation } from '../types/plan';
import { categoryOf } from '../types/plan';

// Reuse the main map's marker icon images (no separate marker style).
// MARKER_ICONS order: [red, blue, purple, yellow, green]. Six categories share
// the five images: 凍結 takes 中止's purple, neither being a plan that moves.
export const CATEGORY_ICON: Record<Category, string> = {
    開業: MARKER_ICONS[3], // yellow
    登録済み: MARKER_ICONS[4], // green
    '計画中(予定あり)': MARKER_ICONS[0], // red
    '計画中(未定)': MARKER_ICONS[1], // blue
    凍結: MARKER_ICONS[2], // purple
    中止: MARKER_ICONS[2], // purple
};

interface PlanMarkersProps {
    map: google.maps.Map | null;
    stations: PlannedStation[];
    visibleCategories: Record<Category, boolean>;
    onSelect: (station: PlannedStation) => void;
}

// Renders one google.maps.Marker per station (individual-marker approach, not
// the Data Layer). Markers are grouped by category so the filter can toggle
// visibility per category without rebuilding them.
export function PlanMarkers({ map, stations, visibleCategories, onSelect }: PlanMarkersProps) {
    const markersRef = useRef<{ marker: google.maps.Marker; category: Category }[]>([]);
    // Keep the click handler bound to the latest onSelect without recreating markers.
    const onSelectRef = useRef(onSelect);
    useEffect(() => {
        onSelectRef.current = onSelect;
    }, [onSelect]);

    useEffect(() => {
        if (!map) {
            return;
        }
        const created = stations
            .filter((s) => s.lat !== null && s.lng !== null)
            .map((s) => {
                const category = categoryOf(s);
                const marker = new google.maps.Marker({
                    position: { lat: s.lat as number, lng: s.lng as number },
                    map,
                    title: s.name,
                    icon: CATEGORY_ICON[category],
                    visible: visibleCategories[category],
                });
                marker.addListener('click', () => onSelectRef.current(s));
                return { marker, category };
            });
        markersRef.current = created;

        return () => {
            for (const { marker } of created) {
                marker.setMap(null);
            }
            markersRef.current = [];
        };
        // visibleCategories is applied by the effect below; markers are only
        // rebuilt when the map or the data changes.
    }, [map, stations]);

    useEffect(() => {
        for (const { marker, category } of markersRef.current) {
            marker.setVisible(visibleCategories[category]);
        }
    }, [visibleCategories]);

    return null;
}
