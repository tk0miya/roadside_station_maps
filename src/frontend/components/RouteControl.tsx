import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { buildDirectionsURL, MAX_ROUTE_SELECTION } from '../route';

interface RouteControlProps {
    map: google.maps.Map | null;
    active: boolean;
    stops: google.maps.Data.Feature[];
    onEnter: () => void;
    onClose: () => void;
}

// The way into route mode and the state of the route once in it, as one box in
// one corner. On a desktop the modifier gestures reach the same place, but a
// touch screen has no modifier to hold, so the mode needs a control of its own.
// Entering the mode grows that control open rather than moving it: what the box
// says changes, where the reader looks does not.
//
// The route itself is read off the map, where the chosen markers carry their
// numbers, so the open box only holds what the markers cannot say: how many
// stops are in, how many the limit allows, and the two things left to do with
// the route — hand it to Google Maps, or drop it.
export function RouteControl({ map, active, stops, onEnter, onClose }: RouteControlProps) {
    // The Maps API places the control, so the box is a bare node handed to it
    // once and drawn into from then on. The node outlives the switch between
    // the two states, which is what keeps the control in one place.
    const [container] = useState(() => {
        const div = document.createElement('div');
        div.className = 'route-control';
        return div;
    });

    useEffect(() => {
        if (!map) return;

        // LEFT_TOP, not TOP_LEFT: it puts the control on the left edge below the
        // TOP_LEFT row instead of inside it.
        const controls = map.controls[google.maps.ControlPosition.LEFT_TOP];
        controls.push(container);

        return () => {
            const index = controls.getArray().indexOf(container);
            if (index >= 0) {
                controls.removeAt(index);
            }
        };
    }, [map, container]);

    if (!map) return null;

    return createPortal(
        active ? (
            <div className="route-control-panel">
                <h2 className="route-control-heading">ルート</h2>
                <span className="route-control-count">
                    {stops.length} / {MAX_ROUTE_SELECTION}
                </span>
                <button
                    type="button"
                    className="route-control-create"
                    disabled={stops.length < 2}
                    onClick={() => window.open(buildDirectionsURL(stops), '_blank', 'noopener')}
                >
                    ルートを作成
                </button>
                <button type="button" className="route-control-close" onClick={onClose}>
                    終了
                </button>
            </div>
        ) : (
            <button type="button" className="route-control-enter" onClick={onEnter}>
                ルート
            </button>
        ),
        container
    );
}
