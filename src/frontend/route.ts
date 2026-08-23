// The route domain: which features a route is built from, how many of them fit,
// and how the finished route is handed over to Google Maps.

// Google Maps directions support at most 10 stops (origin + destination
// + 8 waypoints), so the number of stops a route takes is capped just under
// that bound.
export const MAX_ROUTE_STOPS = 9;

// Decimal places kept in a custom stop's coordinate. 6 places is ~11cm on the
// ground, past what the stop is placed with by eye.
const PRECISION = 6;

// Whether the route has taken all the stops it can.
export function isRouteFull(stops: google.maps.Data.Feature[]): boolean {
    return stops.length >= MAX_ROUTE_STOPS;
}

// A custom stop is a stop the user placed on the map to route through somewhere
// that is not a station, and carries no station data.
export function isCustomStop(feature: google.maps.Data.Feature): boolean {
    return Boolean(feature.getProperty('customStop'));
}

const positionOf = (feature: google.maps.Data.Feature): google.maps.LatLng =>
    (feature.getGeometry() as google.maps.Data.Point).get();

function toStopQuery(feature: google.maps.Data.Feature): string {
    if (isCustomStop(feature)) {
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

export function hasCustomStopAt(stops: google.maps.Data.Feature[], position: google.maps.LatLng): boolean {
    return stops.some((stop) => {
        if (!isCustomStop(stop)) return false;
        const at = positionOf(stop);
        return (
            at.lat().toFixed(PRECISION) === position.lat().toFixed(PRECISION) &&
            at.lng().toFixed(PRECISION) === position.lng().toFixed(PRECISION)
        );
    });
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
