import { useEffect } from 'react';
import type { AuthManager } from './auth-manager';

// Refresh the backend-issued session token on mount and whenever the tab
// becomes visible again. The browser fires `visibilitychange` for tab
// switches, window minimise/restore, and (on most platforms) when the user
// returns from another application — covering the "browser became active"
// case without a separate `focus` listener.
export function useSessionRefresh(authManager: AuthManager): void {
    useEffect(() => {
        void authManager.refreshSession();

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                void authManager.refreshSession();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [authManager]);
}
