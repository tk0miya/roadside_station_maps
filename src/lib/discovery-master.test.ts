// Tests for the discovery queue, against fixtures rather than the real file:
// what data/discovery.json currently holds is the validator's subject
// (src/frontend/discovery-data.test.ts).

import { describe, expect, it } from 'vitest';
import { listDiscovery, markDiscovered } from './discovery-master';
import { todayInJapan } from './plan-master';

describe('listDiscovery', () => {
    it('puts the prefecture searched longest ago first', () => {
        const queue = listDiscovery({ 北海道: '2026-10-21', 青森県: '2026-09-01', 岩手県: '2026-10-01' });

        expect(queue).toEqual([
            { pref: '青森県', discovered_on: '2026-09-01' },
            { pref: '岩手県', discovered_on: '2026-10-01' },
            { pref: '北海道', discovered_on: '2026-10-21' },
        ]);
    });

    it('keeps prefectures stamped on the same day in file order', () => {
        const queue = listDiscovery({ 北海道: '2026-10-21', 青森県: '2026-10-21', 岩手県: '2026-10-21' });

        expect(queue.map((entry) => entry.pref)).toEqual(['北海道', '青森県', '岩手県']);
    });
});

describe('markDiscovered', () => {
    it('stamps the prefecture with today in Japan', () => {
        const discovery = { 北海道: '2026-01-01', 青森県: '2026-01-01' };

        markDiscovered(discovery, '青森県');

        expect(discovery).toEqual({ 北海道: '2026-01-01', 青森県: todayInJapan() });
    });

    it('keeps the key order, so the file stays in prefecture order', () => {
        const discovery = { 北海道: '2026-01-01', 青森県: '2026-01-01' };

        markDiscovered(discovery, '北海道');

        expect(Object.keys(discovery)).toEqual(['北海道', '青森県']);
    });

    it('refuses a prefecture the file does not hold', () => {
        const discovery = { 北海道: '2026-01-01' };

        expect(() => markDiscovered(discovery, '北海')).toThrow('Unknown prefecture: 北海');
        expect(discovery).toEqual({ 北海道: '2026-01-01' });
    });
});
