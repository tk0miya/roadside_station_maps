import { describe, expect, it } from 'vitest';
import { expectApiError } from '#test-utils/gas';
import { parseCommand, UPDATABLE_COLUMNS } from './plan-command';

describe('parseCommand', () => {
    it('treats a body without an action as a list request', () => {
        expect(parseCommand({})).toEqual({ action: 'list' });
    });

    it('rejects an unknown action', () => {
        expectApiError(() => parseCommand({ action: 'drop' }), 'bad_request', /action must be one of/);
    });

    it('rejects a non-object body', () => {
        expectApiError(() => parseCommand('list'), 'bad_request', /must be an object/);
    });

    describe('update', () => {
        it('keeps only the fields the request mentions', () => {
            expect(parseCommand({ action: 'update', name: '道の駅 A', station: { status: '開業' } })).toEqual({
                action: 'update',
                name: '道の駅 A',
                patch: { status: '開業' },
            });
        });

        it('reads an explicit null coordinate as a request to clear the cell', () => {
            expect(parseCommand({ action: 'update', name: 'x', station: { lat: null } })).toMatchObject({
                patch: { lat: null },
            });
        });

        // Number(' ') is 0, so a blank-looking coordinate must be recognised as
        // empty before it is parsed.
        it('reads an empty or whitespace-only coordinate as a request to clear the cell', () => {
            expect(parseCommand({ action: 'update', name: 'x', station: { lat: '' } })).toMatchObject({
                patch: { lat: null },
            });
            expect(parseCommand({ action: 'update', name: 'x', station: { lng: '  ' } })).toMatchObject({
                patch: { lng: null },
            });
        });

        it('accepts a numeric string padded with whitespace', () => {
            expect(parseCommand({ action: 'update', name: 'x', station: { lat: ' 36.28 ' } })).toMatchObject({
                patch: { lat: 36.28 },
            });
        });

        it('keeps memo whitespace, which carries multi-line URL lists', () => {
            const command = parseCommand({ action: 'update', name: 'x', station: { memo: 'https://a\nhttps://b' } });
            expect(command).toMatchObject({ patch: { memo: 'https://a\nhttps://b' } });
        });

        it('requires the target name', () => {
            expectApiError(
                () => parseCommand({ action: 'update', station: { status: '開業' } }),
                'bad_request',
                /name must be a string/
            );
        });

        // A caller may echo back a whole row it read, so columns this API does
        // not write are dropped instead of turning the request into an error.
        it('ignores columns it does not write', () => {
            expect(
                parseCommand({
                    action: 'update',
                    name: 'x',
                    station: { status: '開業', pref: '長野県', city: '松本市' },
                })
            ).toEqual({ action: 'update', name: 'x', pref: undefined, patch: { status: '開業' } });
            expect(parseCommand({ action: 'update', name: 'x', station: { city: '塩尻市' } })).toEqual({
                action: 'update',
                name: 'x',
                pref: undefined,
                patch: {},
            });
        });

        // parsePatch reads each column with a branch of its own, so a column
        // added to UPDATABLE_COLUMNS without one would be dropped silently.
        // Pinning the sample to the declared set turns that into a failure.
        it('accepts every updatable column at once', () => {
            const station = { name: 'y', status: '開業', date: '2027-04-01', lat: 36, lng: 137, memo: 'note' };

            expect(Object.keys(station).sort()).toEqual([...UPDATABLE_COLUMNS].sort());
            expect(parseCommand({ action: 'update', name: 'x', station })).toMatchObject({ patch: station });
        });

        it('rejects a status outside the sheet vocabulary', () => {
            expectApiError(
                () => parseCommand({ action: 'update', name: 'x', station: { status: '検討中' } }),
                'bad_request',
                /status must be one of/
            );
        });

        it('rejects a rename to an empty name', () => {
            expectApiError(
                () => parseCommand({ action: 'update', name: 'x', station: { name: '  ' } }),
                'bad_request',
                /must not be empty/
            );
        });

        it('ignores unknown station fields', () => {
            expect(
                parseCommand({ action: 'update', name: 'x', station: { status: '開業', prefecture: '長野県' } })
            ).toEqual({ action: 'update', name: 'x', pref: undefined, patch: { status: '開業' } });
        });

        it('accepts coordinates as numeric strings', () => {
            expect(parseCommand({ action: 'update', name: 'x', station: { lat: '36.28', lng: 136.25 } })).toMatchObject(
                { patch: { lat: 36.28, lng: 136.25 } }
            );
        });

        it('accepts the extremes of each coordinate range', () => {
            expect(parseCommand({ action: 'update', name: 'x', station: { lat: 90, lng: 180 } })).toMatchObject({
                patch: { lat: 90, lng: 180 },
            });
        });

        it('rejects an out-of-range coordinate, with a different limit per axis', () => {
            expectApiError(
                () => parseCommand({ action: 'update', name: 'x', station: { lat: 120 } }),
                'bad_request',
                /lat must be within -90\.\.90/
            );
            // 120 is a legal longitude, so this pair also pins lat and lng to
            // their own limits rather than a shared one.
            expect(parseCommand({ action: 'update', name: 'x', station: { lng: 120 } })).toMatchObject({
                patch: { lng: 120 },
            });
            expectApiError(
                () => parseCommand({ action: 'update', name: 'x', station: { lng: 181 } }),
                'bad_request',
                /lng must be within -180\.\.180/
            );
        });

        it('rejects a coordinate that is not a number', () => {
            expectApiError(
                () => parseCommand({ action: 'update', name: 'x', station: { lng: 'とうきょう' } }),
                'bad_request',
                /lng must be a number/
            );
        });

        it('takes an empty patch as a no-op', () => {
            expect(parseCommand({ action: 'update', name: 'x', station: {} })).toEqual({
                action: 'update',
                name: 'x',
                pref: undefined,
                patch: {},
            });
        });

        // `pref` selects the row and sits beside `name`; the `pref` inside
        // `station` is a column this API does not write, and is dropped.
        it('carries the top-level pref, not the one inside station', () => {
            expect(parseCommand({ action: 'update', name: 'x', pref: '長野県', station: { pref: '福井県' } })).toEqual({
                action: 'update',
                name: 'x',
                pref: '長野県',
                patch: {},
            });
        });

        it.each([
            ['absent', {}],
            ['empty', { pref: '' }],
            ['whitespace', { pref: '  ' }],
            ['null', { pref: null }],
        ])('leaves pref unset when it is %s', (_label, body) => {
            const command = parseCommand({ action: 'update', name: 'x', station: {}, ...body });
            expect(command).toEqual({ action: 'update', name: 'x', pref: undefined, patch: {} });
        });

        // readTable trims the sheet's cells, so the selector is trimmed too.
        it('trims pref so it matches the trimmed sheet value', () => {
            expect(parseCommand({ action: 'update', name: 'x', pref: ' 長野県 ', station: {} })).toMatchObject({
                pref: '長野県',
            });
        });

        it('rejects a pref that is not a string', () => {
            expectApiError(
                () => parseCommand({ action: 'update', name: 'x', pref: 20, station: {} }),
                'bad_request',
                /pref must be a string/
            );
        });
    });
});
