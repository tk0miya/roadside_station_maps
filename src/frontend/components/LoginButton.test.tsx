/**
 * @vitest-environment jsdom
 * @vitest-environment-options { "url": "http://localhost" }
 */
import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/auth-context';
import {
    ACCESS_TOKEN_STORAGE_KEY,
    AuthManager,
    REFRESH_TOKEN_STORAGE_KEY,
} from '../auth/auth-manager';
import { createMockMap, setupGoogleMapsMock } from '../../test-utils/test-utils';

let lastUseGoogleLoginConfig: {
    onSuccess?: (response: { code: string }) => void;
    onError?: (error: unknown) => void;
} | null = null;
let lastLoginTrigger: ReturnType<typeof vi.fn>;

vi.mock('@react-oauth/google', () => ({
    useGoogleLogin: (config: {
        onSuccess?: (response: { code: string }) => void;
        onError?: (error: unknown) => void;
    }) => {
        lastUseGoogleLoginConfig = config;
        lastLoginTrigger = vi.fn();
        return lastLoginTrigger;
    },
}));

import { LoginButton } from './LoginButton';

function base64UrlEncode(input: string): string {
    return Buffer.from(input, 'utf8')
        .toString('base64')
        .replace(/=+$/, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

function buildJwt(payload: Record<string, unknown>): string {
    const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = base64UrlEncode(JSON.stringify(payload));
    return `${header}.${body}.sig`;
}

function renderWithAuth(ui: React.ReactElement, manager?: AuthManager) {
    const m = manager ?? new AuthManager();
    return { manager: m, ...render(<AuthProvider manager={m}>{ui}</AuthProvider>) };
}

describe('LoginButton', () => {
    beforeEach(() => {
        setupGoogleMapsMock();
        window.localStorage.clear();
        lastUseGoogleLoginConfig = null;
    });

    it('mounts a login button into a TOP_RIGHT map control when logged out', () => {
        const mockMap = createMockMap();

        renderWithAuth(<LoginButton map={mockMap} />);

        const pushMock = mockMap.controls[3].push as unknown as ReturnType<typeof vi.fn>;
        expect(pushMock).toHaveBeenCalledTimes(1);
        const pushedDiv = pushMock.mock.calls[0][0] as HTMLElement;
        expect(pushedDiv.querySelector('button.google-login-button')).not.toBeNull();
    });

    it('does not mount controls when map is null', () => {
        const { container } = renderWithAuth(<LoginButton map={null} />);

        expect(container.firstChild).toBeNull();
    });

    it('does not push the control when already signed in', () => {
        window.localStorage.setItem(
            ACCESS_TOKEN_STORAGE_KEY,
            buildJwt({ sub: 'user-1', sid: 'sid-1', exp: 9999999999, aud: 'api' })
        );
        window.localStorage.setItem(
            REFRESH_TOKEN_STORAGE_KEY,
            buildJwt({ sub: 'user-1', sid: 'sid-1', aud: 'refresh' })
        );

        const mockMap = createMockMap();
        renderWithAuth(<LoginButton map={mockMap} />);

        expect(mockMap.controls[3].push).not.toHaveBeenCalled();
    });

    it('triggers the Google login flow on click', () => {
        const mockMap = createMockMap();
        renderWithAuth(<LoginButton map={mockMap} />);

        const pushMock = mockMap.controls[3].push as unknown as ReturnType<typeof vi.fn>;
        const pushedDiv = pushMock.mock.calls[0][0] as HTMLElement;
        const button = pushedDiv.querySelector('button.google-login-button') as HTMLButtonElement;

        fireEvent.click(button);

        expect(lastLoginTrigger).toHaveBeenCalled();
    });

    it('forwards the auth code to AuthManager.login on success', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(
                JSON.stringify({
                    accessToken: buildJwt({
                        sub: 'user-1',
                        sid: 'sid-1',
                        exp: 9999999999,
                        aud: 'api',
                    }),
                    refreshToken: buildJwt({ sub: 'user-1', sid: 'sid-1', aud: 'refresh' }),
                    user: { sub: 'user-1' },
                }),
                { status: 200, headers: { 'Content-Type': 'application/json' } }
            )
        );

        try {
            const mockMap = createMockMap();
            const manager = new AuthManager();
            const loginSpy = vi.spyOn(manager, 'login');
            renderWithAuth(<LoginButton map={mockMap} />, manager);

            await lastUseGoogleLoginConfig?.onSuccess?.({ code: 'auth-code-xyz' });

            expect(loginSpy).toHaveBeenCalledWith('auth-code-xyz');
        } finally {
            fetchSpy.mockRestore();
        }
    });
});
