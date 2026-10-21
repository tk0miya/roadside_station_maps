// The discovery queue (`data/discovery.json`): each prefecture, in
// 全国地方公共団体コード order, mapped to the day (JST) it was last searched for
// development plans the master does not hold yet. Why the queue exists is in
// docs/plan-map.md (見つける).

import * as fs from 'node:fs';
import { todayInJapan } from './plan-master.js';

// Module-relative so a command works from any directory, like the plan master.
const DISCOVERY_PATH = new URL('../../data/discovery.json', import.meta.url);

// Prefecture -> the last day (JST, yyyy-mm-dd) it was searched.
export type Discovery = Record<string, string>;

export interface DiscoveryEntry {
    pref: string;
    discovered_on: string;
}

export function load(): Discovery {
    return JSON.parse(fs.readFileSync(DISCOVERY_PATH, 'utf-8'));
}

// Same canonical form as data/plans.json: four-space pretty JSON with a trailing
// newline, which is what Biome formats the file to.
export function save(discovery: Discovery): void {
    fs.writeFileSync(DISCOVERY_PATH, `${JSON.stringify(discovery, null, 4)}\n`, 'utf-8');
}

// The queue, searched-longest-ago first. A stable sort, so prefectures stamped on
// the same day stay in file order -- which is prefecture code order. That order
// is what makes the queue walk the country in a fixed order rather than
// whichever order a sort happened to leave.
export function listDiscovery(discovery: Discovery): DiscoveryEntry[] {
    return Object.entries(discovery)
        .map(([pref, discovered_on]) => ({ pref, discovered_on }))
        .sort((a, b) => a.discovered_on.localeCompare(b.discovered_on));
}

// Record that a prefecture was searched today. Assigning to an existing key keeps
// the key order, so the file stays in prefecture order. An unknown prefecture is
// refused rather than appended: a typo would otherwise add a 48th key while the
// prefecture meant stayed at the head of the queue.
export function markDiscovered(discovery: Discovery, pref: string): void {
    if (!Object.hasOwn(discovery, pref)) {
        throw new Error(`Unknown prefecture: ${pref}. It must be one of the keys of data/discovery.json.`);
    }
    discovery[pref] = todayInJapan();
}
