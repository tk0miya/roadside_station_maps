import { GoogleOAuthProvider } from '@react-oauth/google';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from './auth/auth-context';
import { AuthManager } from './auth/auth-manager';
import { AuthRefresher } from './auth/AuthRefresher';
import { GOOGLE_CLIENT_ID } from './config';
import { RoadStationMap } from './components/RoadStationMap';

const container = document.getElementById('map-canvas');
if (container) {
    const authManager = new AuthManager();
    const root = createRoot(container);
    root.render(
        <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
            <AuthProvider manager={authManager}>
                <AuthRefresher />
                <RoadStationMap />
            </AuthProvider>
        </GoogleOAuthProvider>
    );
}
