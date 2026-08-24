// The route domain: which features a route is built from, how many of them fit,
// and how the finished route is handed over to Google Maps.

import type { DataPoint, Feature, LatLng } from './google-maps-types';

// Google Maps directions support at most 10 stops (origin + destination
// + 8 waypoints), so the number of stops a route takes is capped just under
// that bound.
export const MAX_ROUTE_STOPS = 9;

// Decimal places kept in a custom stop's coordinate. 6 places is ~11cm on the
// ground, past what the stop is placed with by eye.
const PRECISION = 6;

// Whether the route has taken all the stops it can.
export function isRouteFull(stops: Feature[]): boolean {
    return stops.length >= MAX_ROUTE_STOPS;
}

// A custom stop is a stop the user placed on the map to route through somewhere
// that is not a station, and carries no station data.
export function isCustomStop(feature: Feature): boolean {
    return Boolean(feature.getProperty('customStop'));
}

const positionOf = (feature: Feature): LatLng => (feature.getGeometry() as DataPoint).get();

function toStopQuery(feature: Feature): string {
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

export function hasCustomStopAt(stops: Feature[], position: LatLng): boolean {
    return stops.some((stop) => {
        if (!isCustomStop(stop)) return false;
        const at = positionOf(stop);
        return (
            at.lat().toFixed(PRECISION) === position.lat().toFixed(PRECISION) &&
            at.lng().toFixed(PRECISION) === position.lng().toFixed(PRECISION)
        );
    });
}

// Move `feature` one number earlier in the route order, wrapping the first
// stop around to the end so repeated calls walk a stop through every
// position. Returns the input array itself when the order cannot change, so the
// state update bails out instead of re-numbering stops for nothing.
export function cycleRouteNumber(stops: Feature[], feature: Feature): Feature[] {
    const index = stops.indexOf(feature);
    if (index < 0 || stops.length === 1) return stops;
    if (index === 0) return [...stops.slice(1), feature];
    const next = [...stops];
    next[index - 1] = feature;
    next[index] = stops[index - 1];
    return next;
}

export function buildDirectionsURL(features: Feature[]): string {
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
