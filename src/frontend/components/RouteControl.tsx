import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { buildDirectionsURL, isRouteFull, MAX_ROUTE_STOPS } from '../route';

interface RouteControlProps {
    map: google.maps.Map | null;
    active: boolean;
    // Handed over as it stands: read as a route only while the switch is on.
    routeStops: google.maps.Data.Feature[];
    onEnter: () => void;
    onAddCustomStop: () => void;
    onClose: () => void;
}

// Route mode as one switch in one corner, with the state of the route under it
// while the mode is on. On a desktop the modifier gestures reach the same place,
// but a touch screen has no modifier to hold, so the mode needs a control of its
// own. Why the mode is a switch rather than a button in and another button out
// is in docs/station-map.md; the shape of the box is in the CSS.
//
// The switch is the only thing in its row that takes a press: the label beside it
// is text, and reaches the switch as its accessible name through aria-labelledby
// rather than by being part of the target. role="switch" with aria-checked is
// what reports which way the switch is thrown; the track it draws to say so is
// aria-hidden, having nothing to add to that.
//
// ESC leaves the mode too, and is handled here because this is what owns leaving
// it: the switch is the way out that has to be aimed at, ESC the one that does
// not.
//
// The second row carries what docs/station-map.md keeps on screen for the route
// being built: how far the stop count is from the limit, the way to put a custom
// stop where no station stands, and the button that hands the route over.
// Dropping the route is not among them — that is either way out again, since
// leaving the mode is what clears the stops.
export function RouteControl({ map, active, routeStops, onEnter, onAddCustomStop, onClose }: RouteControlProps) {
    const labelId = useId();
    // The listener is installed once per spell in the mode, so what it calls has
    // to come from a ref rather than the render it was created in.
    const onCloseRef = useRef(onClose);

    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
        if (!active) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onCloseRef.current();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [active]);

    // The Maps API places the control, so the box is a bare node handed to it
    // once and drawn into from then on. The node outlives the flip between the
    // two states, which is what keeps the control in one place.
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
        <>
            <div className="route-control-mode">
                <span id={labelId}>ルート</span>
                <button
                    type="button"
                    role="switch"
                    aria-checked={active}
                    aria-labelledby={labelId}
                    className="route-control-switch"
                    onClick={active ? onClose : onEnter}
                >
                    <span className="route-control-track" aria-hidden="true" />
                </button>
            </div>
            {active && (
                <div className="route-control-status">
                    <span className="route-control-count">
                        {routeStops.length} / {MAX_ROUTE_STOPS}
                    </span>
                    {/* A station joins the route by its marker being tapped; a
                        place with no station has no marker to tap, so this puts
                        one where the crosshair over the map's middle sits. The
                        label leaves out where the custom stop lands, as the
                        button beside it leaves out what it creates: the row
                        carries three things, and the accessible names carry the
                        rest. */}
                    <button
                        type="button"
                        className="route-control-add"
                        aria-label="地図の中心に地点を追加"
                        disabled={isRouteFull(routeStops)}
                        onClick={onAddCustomStop}
                    >
                        地点追加
                    </button>
                    <button
                        type="button"
                        className="route-control-create"
                        aria-label="ルートを作成"
                        disabled={routeStops.length < 2}
                        onClick={() => window.open(buildDirectionsURL(routeStops), '_blank', 'noopener')}
                    >
                        作成
                    </button>
                </div>
            )}
        </>,
        container
    );
}
