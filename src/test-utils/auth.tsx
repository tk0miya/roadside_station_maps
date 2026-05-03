import { render } from '@testing-library/react';
import type React from 'react';
import { AuthProvider } from '../frontend/auth/auth-context';
import { AuthManager } from '../frontend/auth/auth-manager';
import { GOOGLE_CLIENT_ID } from '../frontend/config';

// Render a React tree wrapped in AuthProvider with a fresh AuthManager
export function renderWithAuth(ui: React.ReactElement) {
    const manager = new AuthManager(GOOGLE_CLIENT_ID);
    return { manager, ...render(<AuthProvider manager={manager}>{ui}</AuthProvider>) };
}
