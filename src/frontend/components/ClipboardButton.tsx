import { useEffect, useState } from 'react';
import Clipboard from 'clipboard';
import queryString from 'query-string';
import { QueryStorage } from '../storage/queries';
import { StationsGeoJSON } from '../types/geojson';

// Get the current URL for sharing
function getURL(stations: StationsGeoJSON) {
    const queries = queryString.parse(location.search);
    const baseuri = window.location.href;
    if (queries.mode == 'shared') {
        return baseuri;
    } else {
        const storage = new QueryStorage();
        storage.loadFromLocalStorage();
        storage.setStationsData(stations);

        const queries = { ...storage.toQuery(), mode: 'shared' };
        if (baseuri.indexOf("?") > 0) {
            return window.location.href + "&" + queryString.stringify(queries);
        } else {
            return window.location.href + "?" + queryString.stringify(queries);
        }
    }
}

// Utility function to fade out an element
async function fadeOut(element: HTMLElement, delay: number): Promise<void> {
    // Set up transition
    element.style.transition = 'opacity 0.4s ease-out';
    element.style.opacity = '1';

    // Wait for the delay
    await new Promise(resolve => setTimeout(resolve, delay));

    // Start fade out
    element.style.opacity = '0';

    // Wait for transition to complete
    await new Promise<void>(resolve => {
        element.addEventListener('transitionend', () => resolve(), { once: true });
    });
}

interface ClipboardButtonProps {
    map: google.maps.Map | null;
    stations: StationsGeoJSON | null;
}

export function ClipboardButton(props: ClipboardButtonProps) {
    const [lastCopiedAt, setLastCopiedAt] = useState<number | null>(null);

    useEffect(() => {
        if (!props.map || !props.stations) return;

        // Create clipboard button
        const div = document.createElement('div');
        div.className = 'clipboard';
        div.innerText = 'シェア';

        // Initialize clipboard functionality with direct element reference
        const clipboard = new Clipboard(div, {
            text: (_trigger: Element) => {
                return getURL(props.stations!);
            }
        });

        // Handle copy success with state update
        clipboard.on('success', () => {
            setLastCopiedAt(Date.now());
        });

        // Add to map controls
        props.map.controls[google.maps.ControlPosition.TOP_LEFT].push(div);
    }, [props.map, props.stations]);

    // Handle copy success message display
    useEffect(() => {
        if (!lastCopiedAt || !props.map) return;

        const showMessage = async () => {
            if (!props.map) return;

            const topControls = props.map.controls[google.maps.ControlPosition.TOP_CENTER];
            const messageDiv = document.createElement('div');
            messageDiv.className = 'clipboard-message';
            messageDiv.innerText = 'クリップボードにコピーしました。';

            topControls.push(messageDiv);

            // Fade out after 3 seconds
            await fadeOut(messageDiv, 3000);
            topControls.pop();
        };

        showMessage();
    }, [lastCopiedAt, props.map]);

    return null; // This component doesn't render anything directly
};
