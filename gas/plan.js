// Spreadsheet operations for the development-plan sheet.
//
// The sheet edited here is the same one the plan map reads as published CSV, so
// the column layout is discovered from the header row instead of being
// hard-coded: the field names accepted by the API are exactly the CSV headers
// (name, pref, city, status, date, lat, lng, memo).

// Header label of the column identifying an entry.
const NAME_FIELD = 'name';

// The plan sheet is the leftmost one, as in the published CSV.
function getPlanSheet() {
    return SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
}

// Header label -> 1-based column index.
function getColumnIndexes(sheet) {
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const indexes = {};
    headers.forEach((header, index) => {
        indexes[String(header).trim()] = index + 1;
    });
    return indexes;
}

// 1-based row number of the entry with the given name, or -1 when it is absent.
function findRowByName(sheet, nameColumn, name) {
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
        return -1;
    }

    const names = sheet.getRange(2, nameColumn, lastRow - 1, 1).getValues();
    const index = names.findIndex((row) => String(row[0]).trim() === name);
    return index === -1 ? -1 : index + 2;
}

// Overwrite the fields given in `values` on the entry identified by `name`.
// Fields left out of `values` keep their current content.
function updateEntry(name, values) {
    const sheet = getPlanSheet();
    const columns = getColumnIndexes(sheet);
    const row = findRowByName(sheet, columns[NAME_FIELD], name);
    if (row === -1) {
        return { updated: false, row: null };
    }

    Object.keys(values).forEach((field) => {
        sheet.getRange(row, columns[field]).setValue(values[field]);
    });

    return { updated: true, row };
}
