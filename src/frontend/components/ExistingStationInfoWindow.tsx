import { useEffect, useRef } from 'react';
import type { DataPoint, Feature, GoogleInfoWindow, GoogleMap } from '../google-maps-types';

interface ExistingStationInfoWindowProps {
    map: GoogleMap | null;
    selected: Feature | null;
}

// Invisible component that drives a single google.maps.InfoWindow, showing
// just the clicked existing station's name (the backdrop dots carry no other
// detail). Content is a DOM text node rather than an HTML string: InfoWindow
// treats a plain string as HTML, and the name comes from scraped data this
// app does not sanitize.
export function ExistingStationInfoWindow({ map, selected }: ExistingStationInfoWindowProps) {
    const infoWindowRef = useRef<GoogleInfoWindow | null>(null);

    useEffect(() => {
        const infoWindow = new google.maps.InfoWindow({ headerDisabled: true });
        infoWindowRef.current = infoWindow;
        return () => infoWindow.close();
    }, []);

    useEffect(() => {
        const infoWindow = infoWindowRef.current;
        if (!infoWindow) {
            return;
        }

        if (selected) {
            const geometry = selected.getGeometry() as DataPoint;
            infoWindow.setOptions({
                position: geometry.get(),
                content: document.createTextNode(selected.getProperty('name') as string),
            });
            infoWindow.open(map);
        } else {
            infoWindow.close();
        }
    }, [selected, map]);

    return null;
}
