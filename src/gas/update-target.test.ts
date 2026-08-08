import { describe, expect, it } from 'vitest';
import { createPlanEntry, expectApiError, planRows } from '#test-utils/gas';
import { resolveUpdate } from './update-target';

const stationA = createPlanEntry({ name: '道の駅 A' });
const stationB = createPlanEntry({ name: '道の駅 B', status: '開業', date: '2023-04-22' });
const stationAinFukui = createPlanEntry({ name: '道の駅 A', pref: '福井県', city: 'あわら市' });

describe('resolveUpdate', () => {
    it('points at the matching row and returns the merged entry', () => {
        const rows = planRows([stationA, stationB]);

        expect(resolveUpdate(rows, { action: 'update', name: '道の駅 B', patch: { status: '中止' } })).toEqual({
            rowNumber: 3,
            station: { ...stationB, status: '中止' },
        });
    });

    it('leaves the entry as it was when the patch is empty', () => {
        const rows = planRows([stationA]);
        expect(resolveUpdate(rows, { action: 'update', name: '道の駅 A', patch: {} })).toEqual({
            rowNumber: 2,
            station: stationA,
        });
    });

    it('reports an unknown station', () => {
        expectApiError(
            () =>
                resolveUpdate(planRows([stationA]), {
                    action: 'update',
                    name: '道の駅 Z',
                    patch: { status: '開業' },
                }),
            'not_found'
        );
    });

    describe('picking a row when the name repeats', () => {
        const rows = planRows([stationA, stationAinFukui]);

        it('refuses to guess when the same name appears in several prefectures', () => {
            expectApiError(
                () =>
                    resolveUpdate(rows, {
                        action: 'update',
                        name: '道の駅 A',
                        patch: { status: '開業' },
                    }),
                'conflict',
                /pass a top-level pref to narrow it down/
            );
        });

        it('picks the row in the prefecture the request names', () => {
            expect(
                resolveUpdate(rows, { action: 'update', name: '道の駅 A', pref: '福井県', patch: { status: '開業' } })
            ).toMatchObject({ rowNumber: 3 });
        });

        it('reports a name that exists in another prefecture as not found', () => {
            expectApiError(
                () =>
                    resolveUpdate(planRows([stationAinFukui]), {
                        action: 'update',
                        name: '道の駅 A',
                        pref: '長野県',
                        patch: { status: '開業' },
                    }),
                'not_found'
            );
        });

        it('does not suggest pref when the duplicate rows share one', () => {
            expectApiError(
                () =>
                    resolveUpdate(planRows([stationA, { ...stationA }]), {
                        action: 'update',
                        name: '道の駅 A',
                        patch: { status: '開業' },
                    }),
                'conflict',
                /fix the sheet first/
            );
        });

        it('does not suggest pref when one of the duplicates has none', () => {
            const blank = createPlanEntry({ name: '道の駅 A', pref: '' });
            expectApiError(
                () =>
                    resolveUpdate(planRows([stationA, blank]), {
                        action: 'update',
                        name: '道の駅 A',
                        patch: { status: '開業' },
                    }),
                'conflict',
                /fix the sheet first/
            );
        });

        it('does not suggest pref when it would leave two rows behind', () => {
            expectApiError(
                () =>
                    resolveUpdate(planRows([stationA, { ...stationA }, stationAinFukui]), {
                        action: 'update',
                        name: '道の駅 A',
                        patch: {
                            status: '開業',
                        },
                    }),
                'conflict',
                /fix the sheet first/
            );
        });

        it('keeps refusing when pref does not separate the duplicates', () => {
            expectApiError(
                () =>
                    resolveUpdate(planRows([stationA, { ...stationA }]), {
                        action: 'update',
                        name: '道の駅 A',
                        pref: '長野県',
                        patch: { status: '開業' },
                    }),
                'conflict',
                /fix the sheet first/
            );
        });
    });

    describe('renaming', () => {
        it('accepts a name that is not in use', () => {
            const rows = planRows([stationA]);
            expect(
                resolveUpdate(rows, {
                    action: 'update',
                    name: '道の駅 A',
                    patch: { name: '道の駅 A2' },
                })
            ).toMatchObject({
                station: { name: '道の駅 A2' },
            });
        });

        it('accepts the name the row already has', () => {
            const rows = planRows([stationA]);
            expect(
                resolveUpdate(rows, {
                    action: 'update',
                    name: '道の駅 A',
                    patch: { name: '道の駅 A' },
                })
            ).toMatchObject({ rowNumber: 2 });
        });

        // Uniqueness is per prefecture, so a name taken elsewhere is not a clash.
        it('accepts a name used in another prefecture', () => {
            const rows = planRows([stationAinFukui, createPlanEntry({ name: '道の駅 C' })]);
            expect(
                resolveUpdate(rows, {
                    action: 'update',
                    name: '道の駅 C',
                    patch: { name: '道の駅 A' },
                })
            ).toMatchObject({ rowNumber: 3 });
        });

        it('refuses a name already used in the same prefecture', () => {
            const rows = planRows([stationA, stationB]);
            expectApiError(
                () =>
                    resolveUpdate(rows, {
                        action: 'update',
                        name: '道の駅 A',
                        patch: { name: '道の駅 B' },
                    }),
                'conflict'
            );
        });

        // Rows whose pref is blank are their own group, so the message cannot
        // name a prefecture.
        it('reports a collision among rows without a prefecture', () => {
            const rows = planRows([
                createPlanEntry({ name: '道の駅 P', pref: '' }),
                createPlanEntry({ name: '道の駅 Q', pref: '' }),
            ]);
            expectApiError(
                () =>
                    resolveUpdate(rows, {
                        action: 'update',
                        name: '道の駅 Q',
                        patch: { name: '道の駅 P' },
                    }),
                'conflict',
                /among the rows without a prefecture/
            );
        });
    });
});
