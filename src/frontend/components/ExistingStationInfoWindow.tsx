import { useEffect, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { DataPoint, Feature, GoogleInfoWindow, GoogleMap } from '../google-maps-types';

interface ExistingStationInfoWindowProps {
    map: GoogleMap | null;
    selected: Feature | null;
}

// Invisible component that drives a single google.maps.InfoWindow, showing
// the clicked existing station's name as a link to its michi-no-eki.jp page
// (the backdrop dots carry no other detail). Rendered through a dedicated
// React root (same pattern as PlanInfoWindow.tsx), so the name — scraped
// data this app does not sanitize — is escaped like any other JSX text
// rather than passed to InfoWindow as a raw HTML string.
export function ExistingStationInfoWindow({ map, selected }: ExistingStationInfoWindowProps) {
    const infoWindowRef = useRef<GoogleInfoWindow | null>(null);
    const contentElementRef = useRef<HTMLElement | null>(null);
    const contentRootRef = useRef<Root | null>(null);

    useEffect(() => {
        infoWindowRef.current = new google.maps.InfoWindow({ headerDisabled: true });
        contentElementRef.current = document.createElement('div');
        contentRootRef.current = createRoot(contentElementRef.current);
        return () => infoWindowRef.current?.close();
    }, []);

    useEffect(() => {
        const infoWindow = infoWindowRef.current;
        const element = contentElementRef.current;
        const root = contentRootRef.current;
        if (!infoWindow || !element || !root) {
            return;
        }

        if (selected) {
            const geometry = selected.getGeometry() as DataPoint;
            const name = selected.getProperty('name') as string;
            const uri = selected.getProperty('uri') as string;
            root.render(
                <a href={uri} target="_blank" rel="noopener noreferrer">
                    道の駅 {name}
                </a>
            );
            infoWindow.setOptions({ position: geometry.get(), content: element });
            infoWindow.open(map);
        } else {
            infoWindow.close();
        }
    }, [selected, map]);

    return null;
}
