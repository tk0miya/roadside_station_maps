/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithAuth } from '@test-utils/auth';
import { buildIdToken } from '@test-utils/test-utils';
import { ID_TOKEN_STORAGE_KEY } from './auth-manager';
import { GOOGLE_CLIENT_ID } from '../config';

interface OneTapOptions {
    onSuccess: (response: { credential?: string }) => void;
    auto_select?: boolean;
    disabled?: boolean;
}

let lastOneTapOptions: OneTapOptions | null = null;

vi.mock('@react-oauth/google', () => ({
    useGoogleOneTapLogin: (options: OneTapOptions) => {
        lastOneTapOptions = options;
    },
}));

import { SilentSignIn } from './SilentSignIn';

describe('SilentSignIn', () => {
    beforeEach(() => {
        window.localStorage.clear();
        lastOneTapOptions = null;
    });

    it('is disabled for first-time visitors with no prior session', () => {
        renderWithAuth(<SilentSignIn />);

        expect(lastOneTapOptions?.disabled).toBe(true);
        expect(lastOneTapOptions?.auto_select).toBe(true);
    });

    it('is disabled while the user is already signed in', () => {
        window.localStorage.setItem(ID_TOKEN_STORAGE_KEY, buildIdToken(GOOGLE_CLIENT_ID));

        renderWithAuth(<SilentSignIn />);

        expect(lastOneTapOptions?.disabled).toBe(true);
    });

    it('is enabled when an expired token is found in storage', () => {
        window.localStorage.setItem(ID_TOKEN_STORAGE_KEY, buildIdToken(GOOGLE_CLIENT_ID, { exp: 1000 }));

        renderWithAuth(<SilentSignIn />);

        expect(lastOneTapOptions?.disabled).toBe(false);
    });

    it('forwards a successfully returned credential to AuthManager.handleCredential', () => {
        window.localStorage.setItem(ID_TOKEN_STORAGE_KEY, buildIdToken(GOOGLE_CLIENT_ID, { exp: 1000 }));

        const { manager } = renderWithAuth(<SilentSignIn />);

        const handleCredential = vi.spyOn(manager, 'handleCredential');
        const newToken = buildIdToken(GOOGLE_CLIENT_ID, { sub: 'user-2' });

        lastOneTapOptions?.onSuccess({ credential: newToken });

        expect(handleCredential).toHaveBeenCalledWith(newToken);
    });
});
