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
    // Wait for SilentSignIn to finish before rendering <GoogleLogin>.
    // GoogleLogin internally calls google.accounts.id.initialize() without
    // auto_select, which would otherwise overwrite SilentSignIn's
    // auto_select=true configuration and prevent silent re-authentication.
    const waitingForSilentSignIn = !authManager.silentSignInSettled;

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

    if (!container || user || waitingForSilentSignIn) return null;

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
