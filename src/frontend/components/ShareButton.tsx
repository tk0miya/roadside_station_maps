import Clipboard from 'clipboard';
import { useEffect, useRef, useState } from 'react';
import { getAuthManagerInstance } from '../auth/auth-manager';
import { useAuth } from '../auth/use-auth';
import { API_BASE_URL } from '../config';
import { SharesApiClient } from '../storage/shares-api-client';

// Build the shareable URL for the given share id
function buildShareURL(shareId: string): string {
    const url = new URL(window.location.href);
    url.search = `?share=${encodeURIComponent(shareId)}`;
    return url.toString();
}

// Utility function to fade out an element
async function fadeOut(element: HTMLElement, delay: number): Promise<void> {
    // Set up transition
    element.style.transition = 'opacity 0.4s ease-out';
    element.style.opacity = '1';

    // Wait for the delay
    await new Promise((resolve) => setTimeout(resolve, delay));

    // Start fade out
    element.style.opacity = '0';

    // Wait for transition to complete
    await new Promise<void>((resolve) => {
        element.addEventListener('transitionend', () => resolve(), { once: true });
    });
}

interface ShareButtonProps {
    map: google.maps.Map | null;
}

export function ShareButton(props: ShareButtonProps) {
    const auth = useAuth();
    const [lastCopiedAt, setLastCopiedAt] = useState<number | null>(null);
    const [shareId, setShareId] = useState<string | null>(null);
    const shareIdRef = useRef<string | null>(null);

    // Sharing is only available to signed-in users.
    const isSignedIn = auth.user !== null;

    useEffect(() => {
        shareIdRef.current = shareId;
    }, [shareId]);

    // Pre-fetch (or create) the share id so the click handler can copy synchronously.
    useEffect(() => {
        if (!isSignedIn) {
            setShareId(null);
            return;
        }

        let cancelled = false;
        const client = new SharesApiClient({
            baseUrl: API_BASE_URL,
            getIdToken: () => getAuthManagerInstance().getState().idToken,
        });
        client
            .create()
            .then((id) => {
                if (cancelled) return;
                setShareId(id);
            })
            .catch((error) => {
                if (cancelled) return;
                console.error('Failed to create share id:', error);
            });

        return () => {
            cancelled = true;
        };
    }, [isSignedIn]);

    useEffect(() => {
        if (!props.map || !isSignedIn) return;

        // Create share button
        const div = document.createElement('div');
        div.className = 'share';
        div.innerText = 'シェア';

        // Initialize clipboard functionality with direct element reference
        const clipboard = new Clipboard(div, {
            text: (_trigger: Element) => {
                const id = shareIdRef.current;
                return id ? buildShareURL(id) : '';
            },
        });

        // Handle copy success with state update
        clipboard.on('success', () => {
            setLastCopiedAt(Date.now());
        });

        // Add to map controls
        const controls = props.map.controls[google.maps.ControlPosition.TOP_LEFT];
        controls.push(div);

        return () => {
            clipboard.destroy();
            const index = controls.getArray().indexOf(div);
            if (index >= 0) {
                controls.removeAt(index);
            }
        };
    }, [props.map, isSignedIn]);

    // Handle copy success message display
    useEffect(() => {
        if (!lastCopiedAt || !props.map) return;

        const showMessage = async () => {
            if (!props.map) return;

            const topControls = props.map.controls[google.maps.ControlPosition.TOP_CENTER];
            const messageDiv = document.createElement('div');
            messageDiv.className = 'share-message';
            messageDiv.innerText = 'クリップボードにコピーしました。';

            topControls.push(messageDiv);

            // Fade out after 3 seconds
            await fadeOut(messageDiv, 3000);
            topControls.pop();
        };

        showMessage();
    }, [lastCopiedAt, props.map]);

    // This component doesn't render anything directly
    return null;
}
