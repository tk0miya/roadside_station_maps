// Web app entry point for the development-plan spreadsheet API.
//
// Only update is exposed: the map lists entries through the published CSV, and
// rows are created and deleted by hand in the spreadsheet.
//
// Request body (Content-Type: text/plain, so the request stays a CORS simple
// request and Apps Script does not answer it with a redirect to a preflight):
//   { "name": "道の駅◯◯", "values": { "status": "開業", "date": "2026-04-01" } }
// Response:
//   { "updated": true, "row": 12 }

function doPost(e) {
    const request = JSON.parse(e.postData.contents);
    const result = updateEntry(request.name, request.values);
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}
