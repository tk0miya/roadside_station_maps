import { GoogleLogin } from '@react-oauth/google';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuthManager } from '../auth/auth-context';

interface LoginButtonProps {
    map: google.maps.Map | null;
}

export function LoginButton({ map }: LoginButtonProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [container, setContainer] = useState<HTMLDivElement | null>(null);
    const authManager = useAuthManager();
    const { user } = authManager.getState();

    useEffect(() => {
        if (!map) return;
        const div = document.createElement('div');
        div.className = 'login-button';
        containerRef.current = div;
        setContainer(div);
    }, [map]);

    useEffect(() => {
        if (!map || !containerRef.current) return;
        const controls = map.controls[google.maps.ControlPosition.TOP_RIGHT];
        const index = controls.getArray().indexOf(containerRef.current);

        if (user) {
            if (index !== -1) controls.removeAt(index);
        } else if (index === -1) {
            controls.push(containerRef.current);
        }
    }, [map, user]);

    if (!container || user) return null;

    return createPortal(
        <GoogleLogin
            onSuccess={(response) => {
                if (response.credential) {
                    authManager.handleCredential(response.credential);
                }
            }}
        />,
        container
    );
}
