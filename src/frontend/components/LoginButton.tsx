import { GoogleLogin } from '@react-oauth/google';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getAuthManagerInstance } from '../auth/auth-manager';
import { useAuth } from '../auth/use-auth';

interface LoginButtonProps {
    map: google.maps.Map | null;
}

export function LoginButton({ map }: LoginButtonProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [container, setContainer] = useState<HTMLDivElement | null>(null);
    const state = useAuth();

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

        if (state.user) {
            if (index !== -1) controls.removeAt(index);
        } else if (index === -1) {
            controls.push(containerRef.current);
        }
    }, [map, state.user]);

    if (!container || state.user) return null;

    return createPortal(
        <GoogleLogin
            onSuccess={(response) => {
                if (response.credential) {
                    getAuthManagerInstance().handleCredential(response.credential);
                }
            }}
        />,
        container
    );
}
