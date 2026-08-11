/**
 * @vitest-environment jsdom
 */
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthState } from '#shared/auth-types';
import { createMockMap, jsonResponse } from '#test-utils/test-utils';
import { ShareButton } from './ShareButton';

// jsdom has no clipboard implementation; install a stub to copy into.
const writeText = vi.fn<(text: string) => Promise<void>>();
Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
});

const mockAuth = vi.hoisted(() => ({
    state: { user: null, sessionToken: null } as AuthState,
}));

// One manager for the whole file: the real hook hands back the context value, so
// the identity has to stay stable or effects keyed on it re-run every render.
vi.mock('../auth/auth-context', () => {
    const manager = { getState: () => mockAuth.state };
    return { useAuthManager: () => manager };
});

Object.defineProperty(global, 'google', {
    value: {
        maps: {
            ControlPosition: {
                TOP_LEFT: 1,
                TOP_CENTER: 2,
            },
        },
    },
    writable: true,
});

describe('ShareButton', () => {
    let originalLocation: Location;

    beforeEach(() => {
        vi.clearAllMocks();
        writeText.mockResolvedValue(undefined);
        mockAuth.state = { user: null, sessionToken: null };
        originalLocation = window.location;

        Object.defineProperty(window, 'location', {
            value: {
                ...originalLocation,
                href: 'https://example.com/test',
                search: '',
            },
            writable: true,
        });
    });

    // Vitest runs without globals, so React Testing Library's auto-cleanup is not
    // registered; unmount explicitly so the next test starts without a button.
    afterEach(() => {
        cleanup();
        vi.useRealTimers();
        Object.defineProperty(window, 'location', {
            value: originalLocation,
            writable: true,
        });
    });

    it('renders nothing visible', () => {
        const { container } = render(<ShareButton map={null} />);
        expect(container.firstChild).toBeNull();
    });

    it('does not add a control when the user is signed out', () => {
        const mockMap = createMockMap();

        render(<ShareButton map={mockMap} />);

        expect(mockMap.controls[1].push).not.toHaveBeenCalled();
    });

    it('adds the share button when the user is signed in', async () => {
        mockAuth.state = { user: { sub: 'user-1' }, sessionToken: 'token-abc' };
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ shareId: 'share-uuid' }, 201));

        try {
            const mockMap = createMockMap();

            render(<ShareButton map={mockMap} />);

            expect(mockMap.controls[1].push).toHaveBeenCalledTimes(1);

            const pushCall = (mockMap.controls[1].push as any).mock.calls[0];
            const buttonElement = pushCall[0] as HTMLElement;
            expect(buttonElement.className).toBe('share');
            expect(buttonElement.innerText).toBe('シェア');
        } finally {
            fetchSpy.mockRestore();
        }
    });

    it('copies the share URL and reports it when the button is clicked', async () => {
        mockAuth.state = { user: { sub: 'user-1' }, sessionToken: 'token-abc' };
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ shareId: 'share-uuid' }, 201));

        try {
            const mockMap = createMockMap();

            render(<ShareButton map={mockMap} />);

            // Clicking does nothing until the share id has been fetched, so keep
            // clicking until the copy goes through.
            const [button] = mockMap.controls[1].getArray() as HTMLElement[];
            await waitFor(() => {
                button.click();
                expect(writeText).toHaveBeenCalledWith('https://example.com/test?share=share-uuid');
            });

            await waitFor(() => {
                const [messageDiv] = mockMap.controls[2].getArray() as HTMLElement[];
                expect(messageDiv?.className).toBe('share-message');
                expect(messageDiv?.innerText).toBe('クリップボードにコピーしました。');
            });
        } finally {
            fetchSpy.mockRestore();
        }
    });

    it('reports a failed copy', async () => {
        mockAuth.state = { user: { sub: 'user-1' }, sessionToken: 'token-abc' };
        writeText.mockRejectedValue(new Error('denied'));
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ shareId: 'share-uuid' }, 201));

        try {
            const mockMap = createMockMap();

            render(<ShareButton map={mockMap} />);

            const [button] = mockMap.controls[1].getArray() as HTMLElement[];
            await waitFor(() => {
                button.click();
                expect(writeText).toHaveBeenCalled();
            });

            await waitFor(() => {
                const [messageDiv] = mockMap.controls[2].getArray() as HTMLElement[];
                expect(messageDiv?.innerText).toBe('クリップボードにコピーできませんでした。');
            });
        } finally {
            fetchSpy.mockRestore();
        }
    });

    it('shows a second copy its own message and retires each in turn', async () => {
        // Let waitFor keep working while the fade-out delay is under our control.
        vi.useFakeTimers({ shouldAdvanceTime: true });
        mockAuth.state = { user: { sub: 'user-1' }, sessionToken: 'token-abc' };
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ shareId: 'share-uuid' }, 201));

        try {
            const mockMap = createMockMap();

            render(<ShareButton map={mockMap} />);

            const [button] = mockMap.controls[1].getArray() as HTMLElement[];
            const messages = mockMap.controls[2];
            await waitFor(() => {
                button.click();
                expect(writeText).toHaveBeenCalled();
            });
            // Clicks before the share id lands copy nothing, so exactly one
            // message follows the click that got through. Its await has to
            // settle before the message is there to count.
            await act(async () => {
                await vi.advanceTimersByTimeAsync(0);
            });
            expect(messages.getArray()).toHaveLength(1);

            // Another copy while the first message is still up stacks its own,
            // even though the text is identical.
            button.click();
            await waitFor(() => expect(messages.getArray()).toHaveLength(2));
            const stacked = messages.getArray() as HTMLElement[];
            const oldest = stacked[0];
            const newest = stacked[stacked.length - 1];

            // Finish only the oldest message's fade-out: that is the one that
            // must go away, not whichever happens to be last.
            await act(async () => {
                await vi.advanceTimersByTimeAsync(3000);
            });
            oldest.dispatchEvent(new Event('transitionend'));

            await waitFor(() => expect(messages.getArray()).not.toContain(oldest));
            expect(messages.getArray()).toContain(newest);
        } finally {
            fetchSpy.mockRestore();
        }
    });

    it('does not copy while the share id is still on its way', async () => {
        mockAuth.state = { user: { sub: 'user-1' }, sessionToken: 'token-abc' };
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));

        try {
            const mockMap = createMockMap();

            render(<ShareButton map={mockMap} />);

            const [button] = mockMap.controls[1].getArray() as HTMLElement[];
            button.click();

            expect(writeText).not.toHaveBeenCalled();
        } finally {
            fetchSpy.mockRestore();
        }
    });
});
