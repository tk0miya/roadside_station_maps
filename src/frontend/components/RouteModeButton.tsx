import { useEffect, useRef } from 'react';

interface RouteModeButtonProps {
    map: google.maps.Map | null;
    visible: boolean;
    onClick: () => void;
}

// The way into route mode. On a desktop the modifier gestures reach the same
// place, but a touch screen has no modifier to hold, so the mode needs a button
// of its own. It steps aside once the route bar is up, which reports the size of
// the route and carries the two things left to do with it.
export function RouteModeButton(props: RouteModeButtonProps) {
    const onClickRef = useRef(props.onClick);

    useEffect(() => {
        onClickRef.current = props.onClick;
    }, [props.onClick]);

    useEffect(() => {
        if (!props.map || !props.visible) return;

        const div = document.createElement('div');
        div.className = 'route-button';
        div.textContent = 'ルート';
        const onClick = () => onClickRef.current();
        div.addEventListener('click', onClick);

        // LEFT_TOP, not TOP_LEFT: it puts the control on the left edge below the
        // TOP_LEFT row instead of inside it.
        const controls = props.map.controls[google.maps.ControlPosition.LEFT_TOP];
        controls.push(div);

        return () => {
            div.removeEventListener('click', onClick);
            const index = controls.getArray().indexOf(div);
            if (index >= 0) {
                controls.removeAt(index);
            }
        };
    }, [props.map, props.visible]);

    return null;
}
