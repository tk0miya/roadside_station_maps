import { useEffect, useRef } from 'react';

interface RouteButtonProps {
    map: google.maps.Map | null;
    multiSelected: google.maps.Data.Feature[];
}

export function buildDirectionsURL(features: google.maps.Data.Feature[]): string {
    const labels = features.map((feature) => {
        const name = feature.getProperty('name') as string;
        return `道の駅 ${name}`;
    });
    const origin = labels[0];
    const destination = labels[labels.length - 1];
    const waypoints = labels.slice(1, -1);
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
