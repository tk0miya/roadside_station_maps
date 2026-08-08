import { GoogleOAuthProvider } from '@react-oauth/google';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from './auth/auth-context';
import { AuthManager } from './auth/auth-manager';
import { RoadStationMap } from './components/RoadStationMap';
import { GOOGLE_CLIENT_ID } from './config';

const container = document.getElementById('map-canvas');
if (container) {
    const authManager = new AuthManager();
    const root = createRoot(container);
    root.render(
        <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
            <AuthProvider manager={authManager}>
                <RoadStationMap />
            </AuthProvider>
        </GoogleOAuthProvider>
    );
}
