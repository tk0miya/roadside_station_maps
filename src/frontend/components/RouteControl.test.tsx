/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockFeature, createMockMap, setupGoogleMapsMock } from '#test-utils/test-utils';
import { buildDirectionsURL, MAX_ROUTE_SELECTION } from '../route';
import { RouteControl } from './RouteControl';

describe('RouteControl', () => {
    let originalOpen: typeof window.open;

    beforeEach(() => {
        setupGoogleMapsMock();
    });

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

    const leftTop = (mockMap: ReturnType<typeof createMockMap>) =>
        mockMap.controls[google.maps.ControlPosition.LEFT_TOP].getArray();

    // On a real map the control ends up inside the map element, which is inside
    // the React tree, and that is how React's events reach it. The mock holds
    // the node on its own, so put it under the render root before clicking.
    const renderControl = (ui: ReactElement, mockMap: ReturnType<typeof createMockMap>) => {
        const result = render(ui);
        const [control] = leftTop(mockMap);
        if (control) result.container.appendChild(control);
        return result;
    };

    it('puts one box into LEFT_TOP controls', () => {
        const mockMap = createMockMap();

        renderControl(
            <RouteControl map={mockMap} active={false} stops={[]} onEnter={() => {}} onClose={() => {}} />,
            mockMap
        );

        expect(leftTop(mockMap)).toHaveLength(1);
    });

    it('holds the switch alone while route mode is off', () => {
        const mockMap = createMockMap();

        renderControl(
            <RouteControl map={mockMap} active={false} stops={[]} onEnter={() => {}} onClose={() => {}} />,
            mockMap
        );

        // The label is text beside the switch rather than part of it, and reaches
        // it as its accessible name.
        const routeSwitch = screen.getByRole('switch', { name: 'ルート' });
        expect(routeSwitch.getAttribute('aria-checked')).toBe('false');
        expect(screen.queryByText('作成')).toBeNull();
    });

    it('reports the way in when the switch goes on', () => {
        const mockMap = createMockMap();
        const onEnter = vi.fn();

        renderControl(
            <RouteControl map={mockMap} active={false} stops={[]} onEnter={onEnter} onClose={() => {}} />,
            mockMap
        );
        fireEvent.click(screen.getByRole('switch'));

        expect(onEnter).toHaveBeenCalledTimes(1);
    });

    it('opens under the same switch rather than moving once route mode starts', () => {
        const mockMap = createMockMap();

        const { rerender } = renderControl(
            <RouteControl map={mockMap} active={false} stops={[]} onEnter={() => {}} onClose={() => {}} />,
            mockMap
        );
        const box = leftTop(mockMap)[0];
        const routeSwitch = screen.getByRole('switch');

        rerender(<RouteControl map={mockMap} active={true} stops={[]} onEnter={() => {}} onClose={() => {}} />);

        expect(leftTop(mockMap)).toHaveLength(1);
        expect(leftTop(mockMap)[0]).toBe(box);
        // The way out is the way in, thrown the other way: the same element,
        // reporting the mode it is now in.
        expect(screen.getByRole('switch')).toBe(routeSwitch);
        expect(routeSwitch.getAttribute('aria-checked')).toBe('true');
        expect(screen.getByText('作成')).toBeTruthy();
    });

    it('reports the stop count against the limit', () => {
        const mockMap = createMockMap();
        const stops = [createMockFeature('1'), createMockFeature('2')];

        renderControl(
            <RouteControl map={mockMap} active={true} stops={stops} onEnter={() => {}} onClose={() => {}} />,
            mockMap
        );

        expect(screen.getByText(`2 / ${MAX_ROUTE_SELECTION}`)).toBeTruthy();
    });

    it('opens the directions for the chosen stops', () => {
        const mockMap = createMockMap();
        const openSpy = mockWindowOpen();
        const stops = [createMockFeature('1', { name: '三笠' }), createMockFeature('2', { name: 'びふか' })];

        renderControl(
            <RouteControl map={mockMap} active={true} stops={stops} onEnter={() => {}} onClose={() => {}} />,
            mockMap
        );
        fireEvent.click(screen.getByText('作成'));

        expect(openSpy).toHaveBeenCalledWith(buildDirectionsURL(stops), '_blank', 'noopener');
    });

    it('keeps the directions button out of reach until a route needs two stops', () => {
        const mockMap = createMockMap();

        renderControl(
            <RouteControl
                map={mockMap}
                active={true}
                stops={[createMockFeature('1')]}
                onEnter={() => {}}
                onClose={() => {}}
            />,
            mockMap
        );

        // By its accessible name: the visible label is shortened to fit the
        // row, and the full wording only survives in aria-label.
        expect((screen.getByLabelText('ルートを作成') as HTMLButtonElement).disabled).toBe(true);
    });

    it('offers the directions once two stops are in', () => {
        const mockMap = createMockMap();
        const stops = [createMockFeature('1'), createMockFeature('2')];

        renderControl(
            <RouteControl map={mockMap} active={true} stops={stops} onEnter={() => {}} onClose={() => {}} />,
            mockMap
        );

        expect((screen.getByText('作成') as HTMLButtonElement).disabled).toBe(false);
    });

    it('asks to leave route mode when the switch goes off', () => {
        const mockMap = createMockMap();
        const onClose = vi.fn();

        renderControl(
            <RouteControl
                map={mockMap}
                active={true}
                stops={[createMockFeature('1')]}
                onEnter={() => {}}
                onClose={onClose}
            />,
            mockMap
        );
        fireEvent.click(screen.getByRole('switch'));

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('takes the box away when it goes', () => {
        const mockMap = createMockMap();

        const { unmount } = renderControl(
            <RouteControl map={mockMap} active={false} stops={[]} onEnter={() => {}} onClose={() => {}} />,
            mockMap
        );
        unmount();

        expect(leftTop(mockMap)).toHaveLength(0);
    });

    // How the map itself arrives: RoadStationMap renders before the Maps API
    // has built one, and hands it over on a later render.
    it('waits for the map before taking a place on it', () => {
        const mockMap = createMockMap();

        const { rerender, container } = render(
            <RouteControl map={null} active={false} stops={[]} onEnter={() => {}} onClose={() => {}} />
        );
        expect(leftTop(mockMap)).toHaveLength(0);

        rerender(<RouteControl map={mockMap} active={false} stops={[]} onEnter={() => {}} onClose={() => {}} />);
        container.appendChild(leftTop(mockMap)[0]);

        expect(leftTop(mockMap)).toHaveLength(1);
        expect(screen.getByRole('switch')).toBeTruthy();
    });
});
