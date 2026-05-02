/**
 * @vitest-environment jsdom
 */
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    getAuthManagerInstance,
    ID_TOKEN_STORAGE_KEY,
    resetAuthManagerInstanceForTests,
} from './auth-manager';
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

describe('SilentSignIn', () => {
    beforeEach(() => {
        window.localStorage.clear();
        resetAuthManagerInstanceForTests();
        lastOneTapOptions = null;
    });

    it('is disabled for first-time visitors with no prior session', () => {
        render(<SilentSignIn />);

        expect(lastOneTapOptions?.disabled).toBe(true);
        expect(lastOneTapOptions?.auto_select).toBe(true);
    });

    it('is disabled while the user is already signed in', () => {
        window.localStorage.setItem(ID_TOKEN_STORAGE_KEY, validToken());

        render(<SilentSignIn />);

        expect(lastOneTapOptions?.disabled).toBe(true);
    });

    it('is enabled when an expired token is found in storage', () => {
        window.localStorage.setItem(ID_TOKEN_STORAGE_KEY, validToken({ exp: 1000 }));

        render(<SilentSignIn />);

        expect(lastOneTapOptions?.disabled).toBe(false);
    });

    it('forwards a successfully returned credential to AuthManager.handleCredential', () => {
        window.localStorage.setItem(ID_TOKEN_STORAGE_KEY, validToken({ exp: 1000 }));

        render(<SilentSignIn />);

        const handleCredential = vi.spyOn(getAuthManagerInstance(), 'handleCredential');
        const newToken = validToken({ sub: 'user-2' });

        lastOneTapOptions?.onSuccess({ credential: newToken });

        expect(handleCredential).toHaveBeenCalledWith(newToken);
    });
});
