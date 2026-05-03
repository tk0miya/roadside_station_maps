/**
 * @vitest-environment jsdom
 */
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthState } from '@shared/auth-types';
import { createMockMap } from '@test-utils/test-utils';
import { ShareButton } from './ShareButton';

vi.mock('clipboard', () => ({
    default: vi.fn(function () {
        return {
            on: vi.fn(),
            destroy: vi.fn(),
        };
    }),
}));

const mockAuth = vi.hoisted(() => ({
    state: { user: null, sessionToken: null } as AuthState,
}));

vi.mock('../auth/auth-context', () => ({
    useAuthManager: () => ({
        getState: () => mockAuth.state,
    }),
}));

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

    afterEach(() => {
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
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({ shareId: 'share-uuid' }), {
                status: 201,
                headers: { 'Content-Type': 'application/json' },
            })
        );

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
});
