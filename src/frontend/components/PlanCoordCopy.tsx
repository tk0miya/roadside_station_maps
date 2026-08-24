import { useCallback, useEffect, useRef, useState } from 'react';
import type { GoogleMap, MapMouseEvent } from '../google-maps-types';

// Decimal places kept when copying. 6 places is ~11cm on the ground, finer than
// a point can be picked by eye at any zoom level, so the remaining digits of the
// clicked coordinate are noise.
const PRECISION = 6;

// How long the confirmation stays on screen (ms).
const TOAST_DURATION = 2000;

// Format a coordinate as a `[lat, lng]` literal, ready to paste into the `lat` /
// `lng` pair of a `data/plans.json` record. `Number()` drops the trailing zeros
// `toFixed()` adds, keeping `36` rather than `36.000000`.
export function formatCoords(lat: number, lng: number): string {
    return `[${Number(lat.toFixed(PRECISION))}, ${Number(lng.toFixed(PRECISION))}]`;
}

interface PlanCoordCopyProps {
    map: GoogleMap | null;
}

// Copies the coordinate under the cursor to the clipboard on right-click, and
// confirms with a short-lived message.
//
// The browser context menu is suppressed: the copy replaces it, and the menu
// would open right on top of the confirmation.
//
// Only the map itself is listened to, so a right-click landing on a marker does
// nothing (marker events do not reach the map). That point is the station's
// recorded position, which is not what anyone is here to copy.
export function PlanCoordCopy({ map }: PlanCoordCopyProps) {
    const [message, setMessage] = useState<string | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const show = useCallback((text: string) => {
        setMessage(text);
        if (timerRef.current !== null) {
            clearTimeout(timerRef.current);
        }
        timerRef.current = setTimeout(() => setMessage(null), TOAST_DURATION);
    }, []);

    useEffect(() => {
        if (!map) {
            return;
        }

        const listener = map.addListener('contextmenu', async (event: MapMouseEvent) => {
            if (!event.latLng) {
                return;
            }
            event.domEvent?.preventDefault();

            const text = formatCoords(event.latLng.lat(), event.latLng.lng());
            try {
                await navigator.clipboard.writeText(text);
                show(`${text} をコピーしました`);
            } catch {
                show('クリップボードにコピーできませんでした');
            }
        });

        return () => {
            listener.remove();
            if (timerRef.current !== null) {
                clearTimeout(timerRef.current);
            }
            // Drop a confirmation left over from the map this effect watched.
            setMessage(null);
        };
    }, [map, show]);

    if (message === null) {
        return null;
    }
    return <div className="plan-toast">{message}</div>;
}
