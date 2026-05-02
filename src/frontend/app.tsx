import { GoogleOAuthProvider } from '@react-oauth/google';
import { createRoot } from 'react-dom/client';
import { GOOGLE_CLIENT_ID } from './config';
import { RoadStationMap } from './components/RoadStationMap';

const container = document.getElementById('map-canvas');
if (container) {
    const root = createRoot(container);
    root.render(
        <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
            <RoadStationMap />
        </GoogleOAuthProvider>
    );
}
