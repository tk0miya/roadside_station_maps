/**
 * @vitest-environment jsdom
 */

import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlannedStation, PlanUrl } from '../types/plan';
import { PlanInfoWindow } from './PlanInfoWindow';

const mockInfoWindow = {
    setOptions: vi.fn(),
    open: vi.fn(),
    close: vi.fn(),
};

const mockMap = {} as google.maps.Map;

Object.defineProperty(global, 'google', {
    value: {
        maps: {
            // biome-ignore lint/complexity/useArrowFunction: stands in for a constructor, so it must be constructible
            InfoWindow: vi.fn(function () {
                return mockInfoWindow;
            }),
            // biome-ignore lint/complexity/useArrowFunction: stands in for a constructor, so it must be constructible
            Size: vi.fn(function () {}),
        },
    },
    writable: true,
});

function station(urls: PlanUrl[]): PlannedStation {
    return {
        name: '道の駅 X',
        pref: '長野県',
        city: '上伊那郡箕輪町',
        status: '計画中',
        date: '2026-04-01',
        lat: 35.9,
        lng: 137.9,
        urls,
        coordSource: 'exact',
    };
}

// Renders the window and returns the element its content was rendered into.
async function content(urls: PlanUrl[]): Promise<HTMLElement> {
    render(<PlanInfoWindow selected={station(urls)} map={mockMap} />);
    const element = mockInfoWindow.setOptions.mock.calls[0][0].content as HTMLElement;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return element;
}

describe('PlanInfoWindow', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders one link per url, labelled by its title', async () => {
        const element = await content([
            { title: '整備計画', url: 'https://example.com/plan' },
            { title: '開業日決定', url: 'https://example.com/news' },
        ]);

        const links = [...element.querySelectorAll('a')];
        expect(links.map((a) => a.textContent)).toEqual(['整備計画', '開業日決定']);
        expect(links.map((a) => a.getAttribute('href'))).toEqual([
            'https://example.com/plan',
            'https://example.com/news',
        ]);
        // The sources are third-party pages, so they must not get the opener.
        expect(links.every((a) => a.getAttribute('rel') === 'noopener noreferrer')).toBe(true);
        expect(links.every((a) => a.getAttribute('target') === '_blank')).toBe(true);
    });

    it('labels a link with its url when the title is blank', async () => {
        const element = await content([{ title: '  ', url: 'https://example.com/plan' }]);

        expect(element.querySelector('a')?.textContent).toBe('https://example.com/plan');
    });

    it('omits the list when a station has no urls', async () => {
        const element = await content([]);

        expect(element.querySelector('ul')).toBeNull();
    });
});
