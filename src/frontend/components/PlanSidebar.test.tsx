/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Category, PlannedStation } from '../types/plan';
import { CATEGORIES } from '../types/plan';
import { REBUILD_ICON } from './PlanMarkers';
import { PlanSidebar } from './PlanSidebar';

const stations: PlannedStation[] = [
    {
        name: '道の駅 X',
        pref: '長野県',
        city: '上伊那郡箕輪町',
        kind: '新設',
        status: '計画中',
        date: '2026-04-01',
        lat: 35.9,
        lng: 137.9,
        urls: [],
        coordSource: 'exact',
    },
];

const allVisible = Object.fromEntries(CATEGORIES.map((c) => [c, true])) as Record<Category, boolean>;

const renderSidebar = () =>
    render(
        <PlanSidebar
            stations={stations}
            visibleCategories={allVisible}
            selected={null}
            onToggle={() => {}}
            onSelect={() => {}}
        />
    );

describe('PlanSidebar icons', () => {
    afterEach(cleanup);

    it('shows the rebuild swatch only beside the two planning headers', () => {
        const { container } = renderSidebar();

        const swatchCounts = [...container.querySelectorAll('.plan-cat-header')].map(
            (header) => header.querySelectorAll('img.plan-swatch').length
        );
        expect(swatchCounts).toEqual([1, 1, 2, 2, 1, 1]);
    });

    it('labels and draws a planned relocation row by its kind', () => {
        render(
            <PlanSidebar
                stations={[{ ...stations[0], kind: '移転' }]}
                visibleCategories={allVisible}
                selected={null}
                onToggle={() => {}}
                onSelect={() => {}}
            />
        );

        const row = screen.getByText('2026-04-01: 道の駅 X (移転)').closest('button');
        expect(row?.querySelector('img')?.getAttribute('src')).toBe(REBUILD_ICON['計画中(予定あり)']);
    });
});

describe('PlanSidebar', () => {
    const originalInnerWidth = window.innerWidth;

    // Vitest runs without globals, so React Testing Library's auto-cleanup is
    // not registered; unmount explicitly to keep queries scoped to one render.
    afterEach(() => {
        cleanup();
        window.innerWidth = originalInnerWidth;
    });

    it('renders the station list expanded by default', () => {
        renderSidebar();

        expect(screen.getByText('2026-04-01: 道の駅 X')).toBeTruthy();
        expect(screen.getByLabelText('サイドバーを閉じる')).toBeTruthy();
    });

    it('collapses to the reopen strip and expands again', () => {
        renderSidebar();

        fireEvent.click(screen.getByLabelText('サイドバーを閉じる'));
        expect(screen.queryByText('2026-04-01: 道の駅 X')).toBeNull();

        fireEvent.click(screen.getByLabelText('サイドバーを開く'));
        expect(screen.getByText('2026-04-01: 道の駅 X')).toBeTruthy();
    });

    it('starts collapsed on a phone-width screen', () => {
        window.innerWidth = 480;

        renderSidebar();

        expect(screen.queryByText('2026-04-01: 道の駅 X')).toBeNull();
        expect(screen.getByLabelText('サイドバーを開く')).toBeTruthy();
    });

    it('starts expanded exactly at the mobile-width threshold', () => {
        window.innerWidth = 768;

        renderSidebar();

        expect(screen.getByText('2026-04-01: 道の駅 X')).toBeTruthy();
        expect(screen.getByLabelText('サイドバーを閉じる')).toBeTruthy();
    });
});
