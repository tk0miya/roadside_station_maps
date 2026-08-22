/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMockFeature } from '#test-utils/test-utils';
import { buildDirectionsURL, MAX_ROUTE_SELECTION } from '../route';
import { RouteBar } from './RouteBar';

describe('RouteBar', () => {
    let originalOpen: typeof window.open;

    // Vitest runs without globals, so React Testing Library's auto-cleanup is
    // never installed and each render has to be torn down by hand.
    afterEach(() => {
        cleanup();
        if (originalOpen) window.open = originalOpen;
    });

    const mockWindowOpen = () => {
        originalOpen = window.open;
        const openSpy = vi.fn();
        window.open = openSpy as unknown as typeof window.open;
        return openSpy;
    };

    it('reports the stop count against the limit', () => {
        render(<RouteBar stops={[createMockFeature('1'), createMockFeature('2')]} onClose={() => {}} />);

        expect(screen.getByText(`ルート 2 / ${MAX_ROUTE_SELECTION}`)).toBeTruthy();
    });

    it('opens the directions for the chosen stops', () => {
        const openSpy = mockWindowOpen();
        const stops = [createMockFeature('1', { name: '三笠' }), createMockFeature('2', { name: 'びふか' })];

        render(<RouteBar stops={stops} onClose={() => {}} />);
        fireEvent.click(screen.getByText('ルートを作成'));

        expect(openSpy).toHaveBeenCalledWith(buildDirectionsURL(stops), '_blank', 'noopener');
    });

    it('keeps the directions button out of reach until a route needs two stops', () => {
        render(<RouteBar stops={[createMockFeature('1')]} onClose={() => {}} />);

        expect((screen.getByText('ルートを作成') as HTMLButtonElement).disabled).toBe(true);
    });

    it('offers the directions once two stops are in', () => {
        render(<RouteBar stops={[createMockFeature('1'), createMockFeature('2')]} onClose={() => {}} />);

        expect((screen.getByText('ルートを作成') as HTMLButtonElement).disabled).toBe(false);
    });

    it('asks to leave route mode', () => {
        const onClose = vi.fn();

        render(<RouteBar stops={[createMockFeature('1')]} onClose={onClose} />);
        fireEvent.click(screen.getByText('終了'));

        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
