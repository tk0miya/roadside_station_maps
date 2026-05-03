/**
 * @vitest-environment jsdom
 */
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from './auth-context';
import { AuthManager, ID_TOKEN_STORAGE_KEY } from './auth-manager';
import { GOOGLE_CLIENT_ID } from '../config';

interface PromptMomentNotification {
    isNotDisplayed: () => boolean;
    isSkippedMoment: () => boolean;
    isDismissedMoment: () => boolean;
}

interface OneTapOptions {
    onSuccess: (response: { credential?: string }) => void;
    onError?: () => void;
    promptMomentNotification?: (notification: PromptMomentNotification) => void;
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

function base64UrlEncode(input: string): string {
    return Buffer.from(input, 'utf8').toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function buildIdToken(payload: Record<string, unknown>): string {
    const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const body = base64UrlEncode(JSON.stringify(payload));
    return `${header}.${body}.sig`;
}

function validToken(overrides: Record<string, unknown> = {}): string {
    return buildIdToken({
        sub: 'user-1',
        iss: 'https://accounts.google.com',
        aud: GOOGLE_CLIENT_ID,
        exp: 9999999999,
        ...overrides,
    });
}

function renderWithAuth(ui: React.ReactElement) {
    const manager = new AuthManager(GOOGLE_CLIENT_ID);
    return { manager, ...render(<AuthProvider manager={manager}>{ui}</AuthProvider>) };
}

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
        window.localStorage.setItem(ID_TOKEN_STORAGE_KEY, validToken());

        renderWithAuth(<SilentSignIn />);

        expect(lastOneTapOptions?.disabled).toBe(true);
    });

    it('is enabled when an expired token is found in storage', () => {
        window.localStorage.setItem(ID_TOKEN_STORAGE_KEY, validToken({ exp: 1000 }));

        renderWithAuth(<SilentSignIn />);

        expect(lastOneTapOptions?.disabled).toBe(false);
    });

    it('forwards a successfully returned credential to AuthManager.handleCredential', () => {
        window.localStorage.setItem(ID_TOKEN_STORAGE_KEY, validToken({ exp: 1000 }));

        const { manager } = renderWithAuth(<SilentSignIn />);

        const handleCredential = vi.spyOn(manager, 'handleCredential');
        const newToken = validToken({ sub: 'user-2' });

        lastOneTapOptions?.onSuccess({ credential: newToken });

        expect(handleCredential).toHaveBeenCalledWith(newToken);
    });

    it('marks silent sign-in settled after a successful response', () => {
        window.localStorage.setItem(ID_TOKEN_STORAGE_KEY, validToken({ exp: 1000 }));

        const { manager } = renderWithAuth(<SilentSignIn />);
        expect(manager.silentSignInSettled).toBe(false);

        lastOneTapOptions?.onSuccess({ credential: validToken({ sub: 'user-2' }) });

        expect(manager.silentSignInSettled).toBe(true);
    });

    it('marks silent sign-in settled when the prompt is not displayed', () => {
        window.localStorage.setItem(ID_TOKEN_STORAGE_KEY, validToken({ exp: 1000 }));

        const { manager } = renderWithAuth(<SilentSignIn />);
        expect(manager.silentSignInSettled).toBe(false);

        lastOneTapOptions?.promptMomentNotification?.({
            isNotDisplayed: () => true,
            isSkippedMoment: () => false,
            isDismissedMoment: () => false,
        });

        expect(manager.silentSignInSettled).toBe(true);
    });

    it('marks silent sign-in settled when the prompt is dismissed', () => {
        window.localStorage.setItem(ID_TOKEN_STORAGE_KEY, validToken({ exp: 1000 }));

        const { manager } = renderWithAuth(<SilentSignIn />);
        expect(manager.silentSignInSettled).toBe(false);

        lastOneTapOptions?.promptMomentNotification?.({
            isNotDisplayed: () => false,
            isSkippedMoment: () => false,
            isDismissedMoment: () => true,
        });

        expect(manager.silentSignInSettled).toBe(true);
    });

    it('marks silent sign-in settled on error', () => {
        window.localStorage.setItem(ID_TOKEN_STORAGE_KEY, validToken({ exp: 1000 }));

        const { manager } = renderWithAuth(<SilentSignIn />);
        expect(manager.silentSignInSettled).toBe(false);

        lastOneTapOptions?.onError?.();

        expect(manager.silentSignInSettled).toBe(true);
    });
});
