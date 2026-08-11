import { useEffect, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { PlannedStation, PlanUrl } from '../types/plan';
import { categoryOf } from '../types/plan';

// `title` is non-blank in the master (checked by plan-data.test.ts), so it can
// be used as the label without a fallback.
function urlNodes(urls: PlanUrl[]) {
    return urls.map((link) => (
        <li key={link.url}>
            <a href={link.url} target="_blank" rel="noopener noreferrer">
                {link.title}
            </a>
        </li>
    ));
}

interface PlanInfoWindowProps {
    map: google.maps.Map | null;
    selected: PlannedStation | null;
}

// Invisible component that drives a single google.maps.InfoWindow, rendering its
// content with a dedicated React root (same pattern as the main InfoWindow.tsx).
export function PlanInfoWindow({ map, selected }: PlanInfoWindowProps) {
    const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
    const contentElementRef = useRef<HTMLElement | null>(null);
    const contentRootRef = useRef<Root | null>(null);

    useEffect(() => {
        infoWindowRef.current = new google.maps.InfoWindow();
        contentElementRef.current = document.createElement('div');
        contentRootRef.current = createRoot(contentElementRef.current);
    }, []);

    useEffect(() => {
        const infoWindow = infoWindowRef.current;
        const element = contentElementRef.current;
        const root = contentRootRef.current;
        if (!infoWindow || !element || !root) {
            return;
        }

        if (selected && selected.lat !== null && selected.lng !== null) {
            const area = `${selected.pref}${selected.city}`;
            const title = selected.date ? `${selected.date}: ${selected.name}` : selected.name;
            root.render(
                <div className="plan-info">
                    <div className="plan-name">{title}</div>
                    <div className="plan-meta">
                        {categoryOf(selected)}
                        {area ? ` / ${area}` : ''}
                    </div>
                    {selected.urls.length > 0 && <ul className="plan-urls">{urlNodes(selected.urls)}</ul>}
                </div>
            );
            infoWindow.setOptions({
                position: { lat: selected.lat, lng: selected.lng },
                content: element,
                headerDisabled: true,
                pixelOffset: new google.maps.Size(0, -30),
            });
            infoWindow.open(map);
        } else {
            infoWindow.close();
        }
    }, [selected, map]);

    return null;
}
