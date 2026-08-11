/**
 * @vitest-environment jsdom
 */

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockMap } from '#test-utils/test-utils';
import { formatCoords, PlanCoordCopy } from './PlanCoordCopy';

const writeText = vi.fn<(text: string) => Promise<void>>();

// jsdom has no clipboard implementation; install a stub the component can call.
const installClipboard = () => {
    Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        configurable: true,
    });
};

// A right-click on the map, as the Maps API delivers it.
const contextMenuEvent = (lat: number, lng: number) => ({
    latLng: { lat: () => lat, lng: () => lng },
    domEvent: { preventDefault: vi.fn() },
});

// Fire the right-click and let the clipboard promise settle.
const rightClick = async (map: ReturnType<typeof createMockMap>, event: unknown) => {
    await act(async () => {
        map._emit('contextmenu', event);
    });
};

describe('formatCoords', () => {
    it('formats a coordinate pair as a lat/lng array literal', () => {
        expect(formatCoords(35.123456, 137.987654)).toBe('[35.123456, 137.987654]');
    });

    it('rounds to 6 decimals and drops trailing zeros', () => {
        expect(formatCoords(35.1234564999, 137.5)).toBe('[35.123456, 137.5]');
        expect(formatCoords(36, -0.5)).toBe('[36, -0.5]');
    });
});

describe('PlanCoordCopy', () => {
    beforeEach(() => {
        writeText.mockReset();
        writeText.mockResolvedValue(undefined);
        installClipboard();
    });

    // Vitest runs without globals, so React Testing Library's auto-cleanup is
    // not registered; unmount explicitly so pending toast timers are cleared.
    afterEach(() => {
        cleanup();
        vi.useRealTimers();
    });

    it('copies the clicked coordinate and confirms it', async () => {
        const map = createMockMap();
        const event = contextMenuEvent(35.123456, 137.987654);

        const { container } = render(<PlanCoordCopy map={map} />);
        await rightClick(map, event);

        // The format itself is covered above; here it only has to be what the
        // clipboard and the confirmation carry.
        expect(writeText).toHaveBeenCalledWith(formatCoords(35.123456, 137.987654));
        expect(container.textContent).toContain(formatCoords(35.123456, 137.987654));
        // The copy replaces the browser context menu.
        expect(event.domEvent.preventDefault).toHaveBeenCalled();
    });

    it('reports a failed copy', async () => {
        const map = createMockMap();
        writeText.mockRejectedValue(new Error('denied'));

        const { container } = render(<PlanCoordCopy map={map} />);
        await rightClick(map, contextMenuEvent(35, 137));

        expect(container.textContent).toBe('クリップボードにコピーできませんでした');
    });

    it('hides the confirmation after a while', async () => {
        vi.useFakeTimers();
        const map = createMockMap();

        const { container } = render(<PlanCoordCopy map={map} />);
        await rightClick(map, contextMenuEvent(35, 137));
        expect(container.textContent).not.toBe('');

        await act(async () => {
            await vi.advanceTimersByTimeAsync(2000);
        });
        expect(container.firstChild).toBeNull();
    });

    it('gives a second copy its own full display time', async () => {
        vi.useFakeTimers();
        const map = createMockMap();

        const { container } = render(<PlanCoordCopy map={map} />);
        await rightClick(map, contextMenuEvent(35, 137));
        await act(async () => {
            await vi.advanceTimersByTimeAsync(1500);
        });
        await rightClick(map, contextMenuEvent(36, 138));

        // The first toast's timer must not carry over and cut this one short.
        await act(async () => {
            await vi.advanceTimersByTimeAsync(1500);
        });
        expect(container.textContent).toContain(formatCoords(36, 138));

        await act(async () => {
            await vi.advanceTimersByTimeAsync(500);
        });
        expect(container.firstChild).toBeNull();
    });

    it('ignores a right-click without a coordinate', async () => {
        const map = createMockMap();

        const { container } = render(<PlanCoordCopy map={map} />);
        await rightClick(map, { latLng: null, domEvent: { preventDefault: vi.fn() } });

        expect(writeText).not.toHaveBeenCalled();
        expect(container.firstChild).toBeNull();
    });

    it('renders nothing when map is null', () => {
        const { container } = render(<PlanCoordCopy map={null} />);

        expect(container.firstChild).toBeNull();
    });
});
