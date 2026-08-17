/**
 * @vitest-environment jsdom
 */

import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockMap, setupGoogleMapsMock } from '#test-utils/test-utils';
import { RouteModeButton } from './RouteModeButton';

describe('RouteModeButton', () => {
    beforeEach(() => {
        setupGoogleMapsMock();
    });

    // Vitest runs without globals, so React Testing Library's auto-cleanup is
    // never installed and each render has to be torn down by hand.
    afterEach(() => {
        cleanup();
    });

    const topCenter = (mockMap: ReturnType<typeof createMockMap>) =>
        mockMap.controls[google.maps.ControlPosition.TOP_CENTER].getArray();

    it('mounts a button into TOP_CENTER controls', () => {
        const mockMap = createMockMap();

        render(<RouteModeButton map={mockMap} visible={true} onClick={() => {}} />);

        expect(topCenter(mockMap)).toHaveLength(1);
        expect(topCenter(mockMap)[0].textContent).toBe('ルート');
    });

    it('renders nothing while hidden', () => {
        const mockMap = createMockMap();

        render(<RouteModeButton map={mockMap} visible={false} onClick={() => {}} />);

        expect(topCenter(mockMap)).toHaveLength(0);
    });

    it('reports a click', () => {
        const mockMap = createMockMap();
        const onClick = vi.fn();

        render(<RouteModeButton map={mockMap} visible={true} onClick={onClick} />);
        topCenter(mockMap)[0].click();

        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('takes the button away once the route bar replaces it', () => {
        const mockMap = createMockMap();

        const { rerender } = render(<RouteModeButton map={mockMap} visible={true} onClick={() => {}} />);
        expect(topCenter(mockMap)).toHaveLength(1);

        rerender(<RouteModeButton map={mockMap} visible={false} onClick={() => {}} />);

        expect(topCenter(mockMap)).toHaveLength(0);
    });

    it('reaches the latest handler after a re-render', () => {
        const mockMap = createMockMap();
        const first = vi.fn();
        const second = vi.fn();

        const { rerender } = render(<RouteModeButton map={mockMap} visible={true} onClick={first} />);
        rerender(<RouteModeButton map={mockMap} visible={true} onClick={second} />);
        topCenter(mockMap)[0].click();

        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledTimes(1);
    });
});
