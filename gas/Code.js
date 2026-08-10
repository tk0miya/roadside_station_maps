// Web app entry points for the development-plan spreadsheet API.
//
// List and update are exposed; rows are created and deleted by hand in the
// spreadsheet. The plan map does not use this API -- it reads the same sheet
// through its published CSV -- so the only client is the `npm run plan` CLI.
//
// GET returns every entry as raw sheet rows, keyed by the header labels:
//   [ { "name": "道の駅◯◯", "status": "計画中", "date": "", ... }, ... ]
//
// POST updates one entry. Its body uses Content-Type: text/plain, so the
// request stays a CORS simple request and Apps Script does not answer it with
// a redirect to a preflight. `name` and `pref` together identify the entry; see
// plan.js for when a write happens at all:
//   { "name": "道の駅◯◯", "pref": "福岡県",
//     "values": { "status": "開業", "date": "2026-04-01" } }
// Response:
//   { "updated": true, "row": 12, "matched": 1 }

function doGet() {
    return ContentService.createTextOutput(JSON.stringify(listEntries())).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
    const request = JSON.parse(e.postData.contents);
    const result = updateEntry(request.name, request.pref, request.values);
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}
