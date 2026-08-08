import { describe, expect, it } from 'vitest';
import { createMemoryPlanStore, createPlanEntry, expectApiError } from '#test-utils/gas';
import { executeCommand } from './api';

const stationA = createPlanEntry({ name: '道の駅 A' });
const stationB = createPlanEntry({ name: '道の駅 B', status: '開業', date: '2023-04-22' });
const stationAinFukui = createPlanEntry({ name: '道の駅 A', pref: '福井県', city: 'あわら市' });

describe('executeCommand', () => {
    it('lists every named row', () => {
        const store = createMemoryPlanStore([stationA, stationB]);
        expect(executeCommand({ action: 'list' }, store)).toEqual({ stations: [stationA, stationB] });
    });

    describe('update', () => {
        it('patches the matching row and returns the merged entry', () => {
            const store = createMemoryPlanStore([stationA, stationB]);
            const result = executeCommand({ action: 'update', name: '道の駅 B', patch: { status: '中止' } }, store);

            expect(result).toEqual({ station: { ...stationB, status: '中止' } });
            expect(store.entries()[1].status).toBe('中止');
            expect(store.entries()[0]).toEqual(stationA);
        });

        it('renames a station when the new name is free', () => {
            const store = createMemoryPlanStore([stationA]);
            executeCommand({ action: 'update', name: '道の駅 A', patch: { name: '道の駅 A2' } }, store);
            expect(store.entries()[0].name).toBe('道の駅 A2');
        });

        it('refuses a rename onto an existing name', () => {
            const store = createMemoryPlanStore([stationA, stationB]);
            expectApiError(
                () => executeCommand({ action: 'update', name: '道の駅 A', patch: { name: '道の駅 B' } }, store),
                'conflict'
            );
            expect(store.entries()).toEqual([stationA, stationB]);
        });

        it('allows a rename that keeps the current name', () => {
            const store = createMemoryPlanStore([stationA]);
            const result = executeCommand(
                { action: 'update', name: '道の駅 A', patch: { name: '道の駅 A', status: '開業' } },
                store
            );

            expect(result).toEqual({ station: { ...stationA, status: '開業' } });
        });

        // The API drops columns it cannot write, so a request may end up with
        // nothing to do. That succeeds without touching the sheet.
        it('leaves the row alone when the patch is empty', () => {
            const store = createMemoryPlanStore([stationA, stationB]);
            const result = executeCommand({ action: 'update', name: '道の駅 A', patch: {} }, store);

            expect(result).toEqual({ station: stationA });
            expect(store.entries()).toEqual([stationA, stationB]);
        });

        // Rows whose pref is blank are their own group, so the message cannot
        // name a prefecture.
        it('reports a rename collision among rows without a prefecture', () => {
            const blank = createPlanEntry({ name: '道の駅 P', pref: '' });
            const store = createMemoryPlanStore([blank, createPlanEntry({ name: '道の駅 Q', pref: '' })]);
            expectApiError(
                () => executeCommand({ action: 'update', name: '道の駅 Q', patch: { name: '道の駅 P' } }, store),
                'conflict',
                /among the rows without a prefecture/
            );
        });

        it('reports an unknown station', () => {
            const store = createMemoryPlanStore([stationA]);
            expectApiError(
                () => executeCommand({ action: 'update', name: '道の駅 Z', patch: { status: '開業' } }, store),
                'not_found'
            );
        });

        it('refuses to guess when the same name appears in several prefectures', () => {
            const store = createMemoryPlanStore([stationA, stationAinFukui]);
            expectApiError(
                () => executeCommand({ action: 'update', name: '道の駅 A', patch: { status: '開業' } }, store),
                'conflict',
                /pass a top-level pref to narrow it down/
            );
        });

        it('picks the row in the prefecture the request names', () => {
            const store = createMemoryPlanStore([stationA, stationAinFukui]);
            const result = executeCommand(
                { action: 'update', name: '道の駅 A', pref: '福井県', patch: { status: '開業' } },
                store
            );

            expect(result).toEqual({ station: { ...stationAinFukui, status: '開業' } });
            expect(store.entries()[0]).toEqual(stationA);
        });

        it('reports a name that exists in another prefecture as not found', () => {
            const store = createMemoryPlanStore([stationAinFukui]);
            expectApiError(
                () =>
                    executeCommand(
                        { action: 'update', name: '道の駅 A', pref: '長野県', patch: { status: '開業' } },
                        store
                    ),
                'not_found'
            );
        });

        it('allows a rename to a name used in another prefecture', () => {
            const stationC = createPlanEntry({ name: '道の駅 C' });
            const store = createMemoryPlanStore([stationAinFukui, stationC]);
            const result = executeCommand(
                { action: 'update', name: '道の駅 C', pref: '長野県', patch: { name: '道の駅 A' } },
                store
            );

            expect(result).toEqual({ station: { ...stationC, name: '道の駅 A' } });
            expect(store.entries()[1].name).toBe('道の駅 A');
        });

        // A blank prefecture cannot be named in a request, so pref would not
        // reach that row either.
        it('does not suggest pref when one of the duplicates has none', () => {
            const store = createMemoryPlanStore([stationA, createPlanEntry({ name: '道の駅 A', pref: '' })]);
            expectApiError(
                () => executeCommand({ action: 'update', name: '道の駅 A', patch: { status: '開業' } }, store),
                'conflict',
                /fix the sheet first/
            );
        });

        // Two of the three share a prefecture, so naming it still leaves an
        // ambiguity.
        it('does not suggest pref when it would leave two rows behind', () => {
            const store = createMemoryPlanStore([stationA, { ...stationA }, stationAinFukui]);
            expectApiError(
                () => executeCommand({ action: 'update', name: '道の駅 A', patch: { status: '開業' } }, store),
                'conflict',
                /fix the sheet first/
            );
        });

        // Retrying with pref cannot separate rows that already share one.
        it('does not suggest pref when the duplicate rows share one', () => {
            const store = createMemoryPlanStore([stationA, { ...stationA }]);
            expectApiError(
                () => executeCommand({ action: 'update', name: '道の駅 A', patch: { status: '開業' } }, store),
                'conflict',
                /fix the sheet first/
            );
        });

        it('keeps refusing when pref does not separate the duplicates', () => {
            const store = createMemoryPlanStore([stationA, { ...stationA }]);
            expectApiError(
                () =>
                    executeCommand(
                        { action: 'update', name: '道の駅 A', pref: '長野県', patch: { status: '開業' } },
                        store
                    ),
                'conflict',
                /fix the sheet first/
            );
        });
    });
});
