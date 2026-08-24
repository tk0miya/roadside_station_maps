import { useEffect, useRef, useState } from 'react';
import { useAuthManager } from '../auth/auth-context';
import type { GoogleMap } from '../google-maps-types';
import { SharesApiClient } from '../storage';

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
    map: GoogleMap | null;
}

export function ShareButton(props: ShareButtonProps) {
    const authManager = useAuthManager();
    // Outcome of the last copy attempt. Wrapped in an object so that repeating
    // the same message still counts as a new state and shows up again.
    const [notice, setNotice] = useState<{ text: string } | null>(null);
    const [shareId, setShareId] = useState<string | null>(null);
    const shareIdRef = useRef<string | null>(null);

    // Sharing is only available to signed-in users.
    const isSignedIn = authManager.getState().user !== null;

    useEffect(() => {
        shareIdRef.current = shareId;
    }, [shareId]);

    // Fetch (or create) the share id up front, before a click needs it.
    useEffect(() => {
        if (!isSignedIn) {
            setShareId(null);
            return;
        }

        let cancelled = false;
        const client = new SharesApiClient({ getSessionToken: () => authManager.getState().sessionToken });
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
    }, [isSignedIn, authManager]);

    useEffect(() => {
        if (!props.map || !isSignedIn) return;

        // Create share button
        const div = document.createElement('div');
        div.className = 'share';
        div.innerText = 'シェア';

        // The share id is pre-fetched, so `writeText` is reached without an
        // await in between: Safari rejects a clipboard write that lands after
        // one. Nothing happens while the id is still on its way.
        const copy = async () => {
            const id = shareIdRef.current;
            if (!id) return;

            try {
                await navigator.clipboard.writeText(buildShareURL(id));
                setNotice({ text: 'クリップボードにコピーしました。' });
            } catch {
                setNotice({ text: 'クリップボードにコピーできませんでした。' });
            }
        };
        div.addEventListener('click', copy);

        // Add to map controls
        const controls = props.map.controls[google.maps.ControlPosition.TOP_LEFT];
        controls.push(div);

        return () => {
            div.removeEventListener('click', copy);
            const index = controls.getArray().indexOf(div);
            if (index >= 0) {
                controls.removeAt(index);
            }
        };
    }, [props.map, isSignedIn]);

    // Handle copy outcome message display
    useEffect(() => {
        if (!notice || !props.map) return;

        const showMessage = async () => {
            if (!props.map) return;

            const topControls = props.map.controls[google.maps.ControlPosition.TOP_CENTER];
            const messageDiv = document.createElement('div');
            messageDiv.className = 'share-message';
            messageDiv.innerText = notice.text;

            topControls.push(messageDiv);

            // Fade out after 3 seconds
            await fadeOut(messageDiv, 3000);

            // Remove this message, not whatever is last: a second copy within
            // those 3 seconds stacks another one on top.
            const index = topControls.getArray().indexOf(messageDiv);
            if (index >= 0) {
                topControls.removeAt(index);
            }
        };

        showMessage();
    }, [notice, props.map]);

    // This component doesn't render anything directly
    return null;
}
