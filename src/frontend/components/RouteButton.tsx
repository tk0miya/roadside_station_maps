import { useEffect, useRef } from 'react';

import { isCustomPoint } from './Markers';

interface RouteButtonProps {
    map: google.maps.Map | null;
    multiSelected: google.maps.Data.Feature[];
}

// Decimal places kept in a custom point's coordinate. 6 places is ~11cm on the
// ground, past what the point is placed with by eye.
const PRECISION = 6;

function toStopQuery(feature: google.maps.Data.Feature): string {
    if (isCustomPoint(feature)) {
        const position = (feature.getGeometry() as google.maps.Data.Point).get();
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

export function RouteButton(props: RouteButtonProps) {
    const featuresRef = useRef<google.maps.Data.Feature[]>(props.multiSelected);
    const isVisible = props.multiSelected.length >= 2;

    useEffect(() => {
        featuresRef.current = props.multiSelected;
    }, [props.multiSelected]);

    useEffect(() => {
        if (!props.map || !isVisible) return;

        const div = document.createElement('div');
        div.className = 'route-button';
        div.textContent = 'ルートを作成';
        const onClick = () => {
            const features = featuresRef.current;
            if (features.length < 2) return;
            window.open(buildDirectionsURL(features), '_blank', 'noopener');
        };
        div.addEventListener('click', onClick);

        const controls = props.map.controls[google.maps.ControlPosition.TOP_CENTER];
        controls.push(div);

        return () => {
            div.removeEventListener('click', onClick);
            const index = controls.getArray().indexOf(div);
            if (index >= 0) {
                controls.removeAt(index);
            }
        };
    }, [props.map, isVisible]);

    return null;
}
