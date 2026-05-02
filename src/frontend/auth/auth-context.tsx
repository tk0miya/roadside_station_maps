import { type ReactNode, createContext, useContext, useSyncExternalStore } from 'react';
import type { AuthManager } from './auth-manager';

const AuthContext = createContext<AuthManager | null>(null);

interface AuthProviderProps {
    manager: AuthManager;
    children: ReactNode;
}

export function AuthProvider({ manager, children }: AuthProviderProps) {
    return <AuthContext.Provider value={manager}>{children}</AuthContext.Provider>;
}

export function useAuthManager(): AuthManager {
    const manager = useContext(AuthContext);
    if (!manager) {
        throw new Error('useAuthManager must be used within an AuthProvider');
    }
    // Subscribe to state changes so consumers re-render on login/logout.
    useSyncExternalStore(
        (callback) => manager.subscribe(callback),
        () => manager.getState()
    );
    return manager;
}
