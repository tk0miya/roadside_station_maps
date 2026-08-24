import { useEffect, useState } from 'react';
import type { MapMouseEvent } from './google-maps-types';

// Track whether the route-editing modifier (Ctrl or Cmd) is currently held, so
// a caller can read the state before an event arrives carrying it.
export function useModifierHeld(): boolean {
    const [held, setHeld] = useState(false);

    useEffect(() => {
        const sync = (event: KeyboardEvent | MouseEvent) => setHeld(event.ctrlKey || event.metaKey);
        // Key events stop arriving while another window has focus, so a key
        // released elsewhere would otherwise stay stuck down.
        const clear = () => setHeld(false);

        window.addEventListener('keydown', sync);
        window.addEventListener('keyup', sync);
        window.addEventListener('blur', clear);
        // A key pressed while another window had focus is never announced by a
        // keydown here, so the state is also taken from the mouse, which carries
        // the modifier on every press. React commits the new state after the
        // press has been dispatched, which is still in time for the double-click
        // that press is the first half of.
        window.addEventListener('mousedown', sync, true);

        return () => {
            window.removeEventListener('keydown', sync);
            window.removeEventListener('keyup', sync);
            window.removeEventListener('blur', clear);
            window.removeEventListener('mousedown', sync, true);
        };
    }, []);

    return held;
}

// Whether the modifier was held down for a single Maps event already in hand,
// as opposed to `useModifierHeld`'s continuously tracked state.
export const isModifierPressed = (event: MapMouseEvent): boolean => {
    const domEvent = event.domEvent as MouseEvent | undefined;
    return Boolean(domEvent && (domEvent.metaKey || domEvent.ctrlKey));
};
