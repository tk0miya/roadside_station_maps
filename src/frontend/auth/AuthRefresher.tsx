import { useEffect } from 'react';
import { useAuthManager } from './auth-context';

/**
 * Refreshes the access token whenever the tab becomes visible again.
 * iOS Safari throttles `setTimeout` in background tabs, so we rely on the
 * `visibilitychange` event (and an initial mount-time check) to recover from
 * long suspensions without surprising the user with a 401.
 */
export function AuthRefresher() {
    const manager = useAuthManager();

    useEffect(() => {
        if (manager.getRefreshToken()) {
            void manager.ensureFreshAccessToken();
        }

        const onVisibility = () => {
            if (document.visibilityState !== 'visible') return;
            if (!manager.getRefreshToken()) return;
            void manager.ensureFreshAccessToken();
        };

        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [manager]);

    return null;
}
