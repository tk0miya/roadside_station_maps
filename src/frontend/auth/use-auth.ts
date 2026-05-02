import { useEffect, useState } from 'react';
import { getAuthManagerInstance } from './auth-manager';
import type { AuthState } from '../../shared/auth-types';

export function useAuth(): AuthState {
    const manager = getAuthManagerInstance();
    const [state, setState] = useState<AuthState>(() => manager.getState());

    useEffect(() => {
        setState(manager.getState());
        return manager.subscribe(setState);
    }, [manager]);

    return state;
}
