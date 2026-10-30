import { describe, expect, it } from 'vitest';
import type { Kind, PlannedStation, Status } from '../types/plan';
import { CATEGORY_ICON, iconOf, REBUILD_ICON } from './PlanMarkers';

function station(kind: Kind, status: Status, date: string): PlannedStation {
    return {
        name: '道の駅 よいち',
        pref: '北海道',
        city: '余市郡余市町',
        kind,
        status,
        date,
        lat: 43.2,
        lng: 140.8,
        urls: [],
        coordSource: 'exact',
    };
}

describe('iconOf', () => {
    it('gives a new station the color of its category', () => {
        expect(iconOf(station('新設', '計画中', '2027'))).toBe(CATEGORY_ICON['計画中(予定あり)']);
        expect(iconOf(station('新設', '計画中', ''))).toBe(CATEGORY_ICON['計画中(未定)']);
    });

    it.each(['移転', '再整備'] as const)('gives a planned %s its own color', (kind) => {
        expect(iconOf(station(kind, '計画中', '2027'))).toBe(REBUILD_ICON['計画中(予定あり)']);
        expect(iconOf(station(kind, '計画中', ''))).toBe(REBUILD_ICON['計画中(未定)']);
    });

    it('keeps the category color for a relocation that is no longer in planning', () => {
        expect(iconOf(station('移転', '開業', '2026-04-01'))).toBe(CATEGORY_ICON.開業);
        expect(iconOf(station('移転', '凍結', ''))).toBe(CATEGORY_ICON.凍結);
    });

    it('keeps the two rebuild images distinct from every category image', () => {
        const categoryIcons = new Set(Object.values(CATEGORY_ICON));
        for (const icon of Object.values(REBUILD_ICON)) {
            expect(categoryIcons.has(icon as string)).toBe(false);
        }
        expect(REBUILD_ICON['計画中(予定あり)']).not.toBe(REBUILD_ICON['計画中(未定)']);
    });
});
