// Client for the development-plan spreadsheet API (gas/Code.js), a Google Apps
// Script web app bound to the human-managed plan spreadsheet.
//
// Both operations hit the same /exec URL: GET lists every entry, POST records one
// as having been researched. Announcing the research on Slack is the Apps
// Script's part of that (gas/slack.js), not this client's.
//
// Only the Slack relay is guarded on the far side, so a failure anywhere else in
// the Apps Script comes back as an HTML error page rather than JSON; readJson
// turns that into a legible error instead of a parse failure surfacing somewhere
// further out.

// One row of the plan sheet, keyed by the header labels
// (name / pref / city / status / date / lat / lng / memo / checked_on). These are
// the raw cell values, not the frontend's PlannedStation: no fallback to the
// municipality's representative point, because only what the sheet actually
// holds can be written back by update().
export type PlanEntry = Record<string, string | number | boolean>;

export interface UpdateResult {
    updated: boolean;
    row: number | null;
    // How many entries the key selected. Nothing is written unless this is 1;
    // see gas/plan.js.
    matched: number;
}

// How much of an unexpected (HTML) response body to quote back.
const MAX_ERROR_BODY = 200;

// Read at call time rather than at module load, so this does not depend on
// dotenv having run first.
function getApiUrl(): string {
    const url = process.env.PLAN_API_URL;
    if (!url) {
        throw new Error('PLAN_API_URL is not set. Copy .env.example to .env and set the GAS Web App /exec URL.');
    }
    return url;
}

async function readJson(response: Response, operation: string): Promise<unknown> {
    if (!response.ok) {
        throw new Error(`Failed to ${operation}: ${response.status}`);
    }

    const body = await response.text();
    try {
        return JSON.parse(body);
    } catch {
        throw new Error(
            `Failed to ${operation}: the API returned a non-JSON response ` +
                `(the Apps Script probably threw): ${body.slice(0, MAX_ERROR_BODY)}`
        );
    }
}

export async function list(): Promise<PlanEntry[]> {
    const response = await fetch(getApiUrl());
    return (await readJson(response, 'list')) as PlanEntry[];
}

// Record the entry keyed by `name` and `pref` -- both required, see gas/plan.js --
// as having been researched: overwrite the given fields, leaving the rest with
// their current content, and relay what the research found to Slack.
//
// `report` -- what the research turned up that no column can hold -- is left out
// of the request entirely when there is none: whether the research is worth
// announcing is the Apps Script's to decide.
export async function update(
    name: string,
    pref: string,
    values: Record<string, string>,
    report?: string
): Promise<UpdateResult> {
    const response = await fetch(getApiUrl(), {
        method: 'POST',
        // text/plain keeps this a CORS simple request; see gas/Code.js.
        headers: { 'Content-Type': 'text/plain' },
        // An absent report leaves no key behind rather than being sent as null:
        // JSON.stringify drops a property whose value is undefined.
        body: JSON.stringify({ name, pref, values, report }),
    });
    return (await readJson(response, 'update')) as UpdateResult;
}
