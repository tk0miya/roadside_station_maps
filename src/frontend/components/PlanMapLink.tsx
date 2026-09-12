import { useEffect } from 'react';
import type { GoogleMap } from '../google-maps-types';

interface PlanMapLinkProps {
    map: GoogleMap | null;
}

export function PlanMapLink({ map }: PlanMapLinkProps) {
    useEffect(() => {
        if (!map) return;

        const link = document.createElement('a');
        link.className = 'plan-map-link';
        link.href = 'plan.html';
        link.innerText = '計画マップ';

        // Add to map controls, below the station counter in the same corner.
        const controls = map.controls[google.maps.ControlPosition.RIGHT_TOP];
        controls.push(link);

        return () => {
            const index = controls.getArray().indexOf(link);
            if (index >= 0) {
                controls.removeAt(index);
            }
        };
    }, [map]);

    return null; // This component doesn't render anything directly
}
