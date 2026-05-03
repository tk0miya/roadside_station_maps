import { useGoogleLogin } from '@react-oauth/google';
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

    const login = useGoogleLogin({
        flow: 'auth-code',
        // Refresh tokens are only issued for the offline access type. The popup
        // flow defaults to using `redirect_uri=postmessage` which the backend
        // mirrors when exchanging the code.
        onSuccess: (response) => {
            void authManager.login(response.code).catch((error) => {
                console.error('Login failed:', error);
            });
        },
        onError: (error) => {
            console.error('Google login error:', error);
        },
    });

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
        <button type="button" className="google-login-button" onClick={() => login()}>
            Google でログイン
        </button>,
        container
    );
}
