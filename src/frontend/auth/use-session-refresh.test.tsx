/**
 * @vitest-environment jsdom
 * @vitest-environment-options { "url": "http://localhost" }
 */
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthManager } from './auth-manager';
import { useSessionRefresh } from './use-session-refresh';

function Harness({ manager }: { manager: AuthManager }) {
    useSessionRefresh(manager);
    return null;
}

describe('useSessionRefresh', () => {
    let manager: AuthManager;
    let refreshSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        localStorage.clear();
        manager = new AuthManager();
        refreshSpy = vi.spyOn(manager, 'refreshSession').mockResolvedValue();
    });

    afterEach(() => {
        refreshSpy.mockRestore();
    });

    it('refreshes once on mount', () => {
        render(<Harness manager={manager} />);

        expect(refreshSpy).toHaveBeenCalledTimes(1);
    });

    it('refreshes when the page becomes visible', () => {
        render(<Harness manager={manager} />);
        refreshSpy.mockClear();

        act(() => {
            Object.defineProperty(document, 'visibilityState', {
                configurable: true,
                value: 'visible',
            });
            document.dispatchEvent(new Event('visibilitychange'));
        });

        expect(refreshSpy).toHaveBeenCalledTimes(1);
    });

    it('does not refresh when the page is hidden', () => {
        render(<Harness manager={manager} />);
        refreshSpy.mockClear();

        act(() => {
            Object.defineProperty(document, 'visibilityState', {
                configurable: true,
                value: 'hidden',
            });
            document.dispatchEvent(new Event('visibilitychange'));
        });

        expect(refreshSpy).not.toHaveBeenCalled();
    });

    it('removes the listener on unmount', () => {
        const { unmount } = render(<Harness manager={manager} />);
        unmount();
        refreshSpy.mockClear();

        act(() => {
            Object.defineProperty(document, 'visibilityState', {
                configurable: true,
                value: 'visible',
            });
            document.dispatchEvent(new Event('visibilitychange'));
        });

        expect(refreshSpy).not.toHaveBeenCalled();
    });
});
