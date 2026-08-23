// The route domain: which features a route is built from, what a gesture on the
// map means while one is being built, and how the finished route is handed over
// to Google Maps.

// Google Maps directions support at most 10 stops (origin + destination
// + 8 waypoints), so the route-selection set is capped just under that bound.
export const MAX_ROUTE_SELECTION = 9;

// Decimal places kept in a custom point's coordinate. 6 places is ~11cm on the
// ground, past what the point is placed with by eye.
const PRECISION = 6;

// A custom point is a feature the user dropped on the map to route through a
// place that is not a station. It carries no station data, so a branch that
// assumes some has to step around it.
export function isCustomPoint(feature: google.maps.Data.Feature): boolean {
    return Boolean(feature.getProperty('customPoint'));
}

const positionOf = (feature: google.maps.Data.Feature): google.maps.LatLng =>
    (feature.getGeometry() as google.maps.Data.Point).get();

function toStopQuery(feature: google.maps.Data.Feature): string {
    if (isCustomPoint(feature)) {
        const position = positionOf(feature);
        return `${position.lat().toFixed(PRECISION)},${position.lng().toFixed(PRECISION)}`;
    }
    const name = feature.getProperty('name') as string;
    const prefName = feature.getProperty('prefName') as string;
    // Some station names are shared by two prefectures ("さかい" sits in both
    // Ibaraki and Fukui), and the bare name lets Google Maps route to the
    // wrong one. The prefecture comes from its own field rather than the
    // address, because a handful of addresses omit it.
    return `道の駅 ${name} ${prefName}`;
}

export function buildDirectionsURL(features: google.maps.Data.Feature[]): string {
    const stops = features.map(toStopQuery);
    const origin = stops[0];
    const destination = stops[stops.length - 1];
    const waypoints = stops.slice(1, -1);
    const url = new URL('https://www.google.com/maps/dir/');
    url.searchParams.set('api', '1');
    url.searchParams.set('origin', origin);
    url.searchParams.set('destination', destination);
    if (waypoints.length > 0) {
        url.searchParams.set('waypoints', waypoints.join('|'));
    }
    return url.toString();
}

export interface MapClickContext {
    modifierPressed: boolean;
    routeMode: boolean;
}

// Whether a click on the map itself — as opposed to one on a marker — puts the
// current selection away. It does so only when no route is being edited:
//
//   - a modifier-click is the click that precedes the double-click dropping a
//     route point, and must not clear the route that point is about to join;
//   - in route mode the route is only dropped by throwing the route switch off,
//     since a stray tap on the map is far too easy on a phone to let it undo
//     nine taps of work.
export function clearsSelectionOnMapClick({ modifierPressed, routeMode }: MapClickContext): boolean {
    return !modifierPressed && !routeMode;
}
