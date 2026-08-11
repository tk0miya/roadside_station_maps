/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Category, PlannedStation } from '../types/plan';
import { CATEGORIES } from '../types/plan';
import { PlanSidebar } from './PlanSidebar';

const stations: PlannedStation[] = [
    {
        name: '道の駅 X',
        pref: '長野県',
        city: '上伊那郡箕輪町',
        status: '計画中',
        date: '2026-04-01',
        lat: 35.9,
        lng: 137.9,
        memo: '',
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

describe('PlanSidebar', () => {
    // Vitest runs without globals, so React Testing Library's auto-cleanup is
    // not registered; unmount explicitly to keep queries scoped to one render.
    afterEach(cleanup);

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
});
