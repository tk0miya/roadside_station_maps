import { buildDirectionsURL, MAX_ROUTE_SELECTION } from '../route';

interface RouteBarProps {
    stops: google.maps.Data.Feature[];
    onClose: () => void;
}

// The state of the route being built, as one line at the bottom of the screen.
// The route itself is read off the map, where the chosen markers carry their
// numbers, so the bar only holds what the markers cannot say: how many stops are
// in, how many the limit allows, and the two things left to do with the route —
// hand it to Google Maps, or drop it.
export function RouteBar({ stops, onClose }: RouteBarProps) {
    return (
        <div className="route-bar">
            <span className="route-bar-count">
                ルート {stops.length} / {MAX_ROUTE_SELECTION}
            </span>
            <button
                type="button"
                className="route-bar-create"
                disabled={stops.length < 2}
                onClick={() => window.open(buildDirectionsURL(stops), '_blank', 'noopener')}
            >
                ルートを作成
            </button>
            <button type="button" className="route-bar-close" onClick={onClose}>
                終了
            </button>
        </div>
    );
}
