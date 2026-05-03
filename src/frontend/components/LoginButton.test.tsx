/**
 * @vitest-environment jsdom
 * @vitest-environment-options { "url": "http://localhost" }
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ID_TOKEN_STORAGE_KEY } from '../auth/auth-manager';
import { GOOGLE_CLIENT_ID } from '../config';
import { renderWithAuth } from '@test-utils/auth';
import { buildIdToken, createMockMap, setupGoogleMapsMock } from '@test-utils/test-utils';

let lastGoogleLoginProps: { onSuccess?: (response: { credential?: string }) => void } | null = null;

vi.mock('@react-oauth/google', () => ({
    GoogleLogin: (props: { onSuccess?: (response: { credential?: string }) => void }) => {
        lastGoogleLoginProps = props;
        return <div data-testid="google-login" />;
    },
}));

import { LoginButton } from './LoginButton';

describe('LoginButton', () => {
    beforeEach(() => {
        setupGoogleMapsMock();
        window.localStorage.clear();
        lastGoogleLoginProps = null;
    });

    it('mounts the GoogleLogin button into a TOP_RIGHT map control when logged out', () => {
        const mockMap = createMockMap();

        renderWithAuth(<LoginButton map={mockMap} />);

        const pushMock = mockMap.controls[3].push as unknown as ReturnType<typeof vi.fn>;
        expect(pushMock).toHaveBeenCalledTimes(1);
        const pushedDiv = pushMock.mock.calls[0][0] as HTMLElement;
        expect(pushedDiv.querySelector('[data-testid="google-login"]')).not.toBeNull();
    });

    it('does not mount controls when map is null', () => {
        const { container } = renderWithAuth(<LoginButton map={null} />);

        expect(container.firstChild).toBeNull();
    });

    it('does not push the control when already signed in', () => {
        const token = buildIdToken(GOOGLE_CLIENT_ID);
        window.localStorage.setItem(ID_TOKEN_STORAGE_KEY, token);

        const mockMap = createMockMap();
        renderWithAuth(<LoginButton map={mockMap} />);

        expect(mockMap.controls[3].push).not.toHaveBeenCalled();
    });

    it('forwards the credential to AuthManager.handleCredential on success', () => {
        const mockMap = createMockMap();
        const { manager } = renderWithAuth(<LoginButton map={mockMap} />);

        const handleCredential = vi.spyOn(manager, 'handleCredential');
        const token = buildIdToken(GOOGLE_CLIENT_ID);

        lastGoogleLoginProps?.onSuccess?.({ credential: token });

        expect(handleCredential).toHaveBeenCalledWith(token);
    });
});
