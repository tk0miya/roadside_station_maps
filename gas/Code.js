// Web app entry points for the development-plan spreadsheet API.
//
// List and update are exposed; rows are created and deleted by hand in the
// spreadsheet. The plan map does not use this API -- it reads the same sheet
// through its published CSV -- so the only client is the `npm run plan` CLI.
//
// GET returns every entry as raw sheet rows, keyed by the header labels:
//   [ { "name": "道の駅◯◯", "status": "計画中", "date": "", ... }, ... ]
//
// POST records one entry having been researched: it writes the fields given in
// `values` and posts what came of the research to Slack. Its body uses
// Content-Type: text/plain, so the request stays a CORS simple request and Apps
// Script does not answer it with a redirect to a preflight. `name` and `pref`
// together identify the entry; see plan.js for when a write happens at all:
//   { "name": "道の駅◯◯", "pref": "福岡県",
//     "values": { "status": "開業", "date": "2026-04-01" },
//     "report": "city が誤り（実際は◯◯町）" }
// Response:
//   { "updated": true, "row": 12, "matched": 1 }
//
// `report` is optional: the half of a research result no column can hold, a
// question for whoever curates the sheet. It is relayed to Slack and kept
// nowhere.

function doGet() {
    return ContentService.createTextOutput(JSON.stringify(listEntries())).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
    const request = JSON.parse(e.postData.contents);
    const result = updateEntry(request.name, request.pref, request.values);
    if (result.updated) {
        notify(request, result);
    }

    // Assembled field by field rather than returning `result` as it stands: its
    // `changes` exists for the notification, and the client has the values it
    // sent already.
    return ContentService.createTextOutput(
        JSON.stringify({ updated: result.updated, row: result.row, matched: result.matched })
    ).setMimeType(ContentService.MimeType.JSON);
}

// Relay the research to Slack, swallowing a failure rather than raising it: the
// sheet has been written by the time this runs, and letting the exception out
// would answer a successful update with Apps Script's HTML error page -- an
// update that looks to have failed but did not.
//
// The reason is left in the execution log rather than the response: UrlFetchApp
// names the URL it could not reach, and the response goes to whoever called an
// ANYONE_ANONYMOUS endpoint. Whoever set the webhook property can read the log.
function notify(request, result) {
    try {
        notifyResearch(request.name, request.pref, result.row, result.changes, request.report);
    } catch (error) {
        console.error(`Failed to notify Slack: ${error}`);
    }
}
