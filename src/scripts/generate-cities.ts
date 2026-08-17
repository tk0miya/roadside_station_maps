// Regenerates `data/cities.json` from デジタル庁 アドレス・ベース・レジストリ, and
// follows the result in `data/plans.json`.
//
// Takes no arguments, and there is no dry-run flag to keep in step with the real
// path: what it would have printed, it prints anyway, and `git diff` is where a
// change is looked at before it is committed.
//
// Run from Japan -- see the note on the CDN in src/lib/abr.ts.
//
// Everything printed goes to stderr, which leaves stdout free.

import type { City } from '../frontend/types/plan.js';
import { fetchCities, fetchPositions } from '../lib/abr.js';
import { buildCities, diffCities, saveCities } from '../lib/cities-master.js';
import { load, repointPlans, savePlans, todayInJapan } from '../lib/plan-master.js';

// Long lists are cut, and the cut is always stated: a silent truncation reads as
// "that was all of them".
const MAX_LISTED = 15;

function report(line: string): void {
    process.stderr.write(`${line}\n`);
}

function names(cities: City[]): string {
    const listed = cities.slice(0, MAX_LISTED).map((city) => `${city.pref} ${city.city}`);
    const rest = cities.length - listed.length;
    return rest > 0 ? `${listed.join(', ')}, and ${rest} more` : listed.join(', ');
}

async function main(): Promise<void> {
    // Read the master before anything is written: `load` reads the city table
    // too, and it has to be the old one for the diff to mean anything.
    const master = load();

    process.stderr.write('Fetching mt_city_all ...');
    const rows = await fetchCities();
    process.stderr.write(` done (${rows.length} rows)\n`);

    process.stderr.write('Fetching mt_city_pos_all ...');
    const positions = await fetchPositions();
    process.stderr.write(` done (${positions.length} rows)\n`);

    const cities = buildCities(rows, positions, todayInJapan());
    const prefectures = new Set(cities.map((city) => city.pref));
    report(`Built ${cities.length} municipalities in ${prefectures.size} prefectures.`);

    const diff = diffCities(master.cities, cities);
    report('');
    report(`Changes: +${diff.added.length} added, -${diff.removed.length} removed, ${diff.renamed.length} renamed.`);
    if (diff.added.length > 0) {
        report(`  added: ${names(diff.added)}`);
    }
    if (diff.removed.length > 0) {
        report(`  removed: ${names(diff.removed)}`);
    }
    for (const change of diff.renamed) {
        report(`  renamed: ${change.from.pref} ${change.from.city} -> ${change.to.city}`);
    }

    saveCities(cities);

    // The plan master follows the city table. A rename is applied because the
    // code proves it is the same municipality; anything else -- a merger, a
    // split -- has no single successor and is reported for someone to decide.
    const renames = new Map(
        diff.renamed.map((change) => [
            `${change.from.pref} ${change.from.city}`,
            { pref: change.to.pref, city: change.to.city },
        ])
    );
    const plans = repointPlans(master.plans, cities, renames);
    savePlans(plans);

    report('');
    for (const change of diff.renamed) {
        const count = master.plans.filter(
            (plan) => plan.pref === change.from.pref && plan.city === change.from.city
        ).length;
        if (count > 0) {
            report(`data/plans.json: repointed ${count} record(s) from ${change.from.city} to ${change.to.city}.`);
        }
    }

    const known = new Set(cities.map((city) => `${city.pref} ${city.city}`));
    const orphans = plans.filter((plan) => !known.has(`${plan.pref} ${plan.city}`));
    if (orphans.length === 0) {
        report('data/plans.json: every record names a municipality the new table has.');
        return;
    }

    // Left in the file rather than blocked. The report is on screen, and
    // `src/frontend/plan-data.test.ts` fails on exactly this, so a commit made
    // without reading it still goes red in CI. Refusing to write would throw
    // away the regenerated table along with the problem.
    report(`data/plans.json: ${orphans.length} record(s) name a municipality the new table does not have.`);
    report('The successor is a judgement, so these were left alone. Repoint each with:');
    for (const plan of orphans) {
        report(`  ${plan.pref} ${plan.city} -- ${plan.name}`);
        report(`    npm run plan -- update "${plan.name}" ${plan.pref} --city=<municipality>`);
    }
    // Unlike the renames applied above, that command stamps `checked_on` with
    // today: it is the master's only entrance and stamping there is what makes
    // the stamp unskippable. Worth knowing, because it moves the record to the
    // back of the research queue without anyone having researched it.
    report('That command stamps checked_on with today, which the automatic repointing above does not.');
}

main().catch((error) => {
    console.error('Error:', error);
    process.exit(1);
});
