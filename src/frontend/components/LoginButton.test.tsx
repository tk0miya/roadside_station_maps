/**
 * @vitest-environment jsdom
 * @vitest-environment-options { "url": "http://localhost" }
 */
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    getAuthManagerInstance,
    ID_TOKEN_STORAGE_KEY,
    resetAuthManagerInstanceForTests,
} from '../auth/auth-manager';
import { GOOGLE_CLIENT_ID } from '../auth/config';
import { createMockMap, setupGoogleMapsMock } from '../../test-utils/test-utils';

let lastGoogleLoginProps: { onSuccess?: (response: { credential?: string }) => void } | null = null;

vi.mock('@react-oauth/google', () => ({
    GoogleLogin: (props: { onSuccess?: (response: { credential?: string }) => void }) => {
        lastGoogleLoginProps = props;
        return <div data-testid="google-login" />;
    },
}));

import { LoginButton } from './LoginButton';

function base64UrlEncode(input: string): string {
    return Buffer.from(input, 'utf8').toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function buildIdToken(payload: Record<string, unknown>): string {
    const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const body = base64UrlEncode(JSON.stringify(payload));
    return `${header}.${body}.sig`;
}

describe('LoginButton', () => {
    beforeEach(() => {
        setupGoogleMapsMock();
        window.localStorage.clear();
        resetAuthManagerInstanceForTests();
        lastGoogleLoginProps = null;
    });

    it('mounts the GoogleLogin button into a TOP_RIGHT map control when logged out', () => {
        const mockMap = createMockMap();

        render(<LoginButton map={mockMap} />);

        const pushMock = mockMap.controls[3].push as unknown as ReturnType<typeof vi.fn>;
        expect(pushMock).toHaveBeenCalledTimes(1);
        const pushedDiv = pushMock.mock.calls[0][0] as HTMLElement;
        expect(pushedDiv.querySelector('[data-testid="google-login"]')).not.toBeNull();
    });

    it('does not mount controls when map is null', () => {
        const { container } = render(<LoginButton map={null} />);

        expect(container.firstChild).toBeNull();
    });

    it('does not push the control when already signed in', () => {
        const token = buildIdToken({
            sub: 'user-1',
            iss: 'https://accounts.google.com',
            aud: GOOGLE_CLIENT_ID,
            exp: 9999999999,
        });
        window.localStorage.setItem(ID_TOKEN_STORAGE_KEY, token);

        const mockMap = createMockMap();
        render(<LoginButton map={mockMap} />);

        expect(mockMap.controls[3].push).not.toHaveBeenCalled();
    });

    it('forwards the credential to AuthManager.handleCredential on success', () => {
        const mockMap = createMockMap();
        render(<LoginButton map={mockMap} />);

        const handleCredential = vi.spyOn(getAuthManagerInstance(), 'handleCredential');
        const token = buildIdToken({
            sub: 'user-1',
            iss: 'https://accounts.google.com',
            aud: GOOGLE_CLIENT_ID,
            exp: 9999999999,
        });

        lastGoogleLoginProps?.onSuccess?.({ credential: token });

        expect(handleCredential).toHaveBeenCalledWith(token);
    });
});
