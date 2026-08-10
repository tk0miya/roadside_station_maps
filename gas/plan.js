// Spreadsheet operations for the development-plan sheet.
//
// The sheet edited here is the same one the plan map reads as published CSV, so
// the column layout is discovered from the header row instead of being
// hard-coded: the field names accepted by the API are exactly the CSV headers
// (name, pref, city, status, date, lat, lng, memo, checked_on).
//
// The sheet is read in one place, readPlanSheet, which normalizes every value it
// hands out, so what listEntries returns is what findRows matches on.

// Header labels of the columns identifying an entry. A name is not unique on
// its own -- 道の駅 川崎町 exists in both 福岡県 and 宮城県 -- so the prefecture
// is the second half of the key.
const NAME_FIELD = 'name';
const PREF_FIELD = 'pref';

// Whether a cell value is a date, tested by its internal class rather than with
// `instanceof`: the Spreadsheet service builds its Dates in a context of its
// own, where the prototype chain does not lead back to this script's `Date`, so
// `instanceof` misses them and the raw object reaches JSON.stringify, which
// serializes it as an ISO-8601 string.
function isDate(value) {
    return Object.prototype.toString.call(value) === '[object Date]';
}

// Sheet cell value -> JSON-safe value: a Date becomes yyyy-MM-dd, so the API's
// shape does not depend on how the column happens to be formatted, and text is
// trimmed. Everything else is passed through, which keeps numeric columns (lat,
// lng) numbers in the JSON and empty cells empty strings.
//
// A date cell holds midnight in the spreadsheet's own timezone, so that is the
// timezone it has to be read back in: formatting it in any other one can land on
// the neighbouring day, making the API disagree with what the cell displays.
function toFieldValue(value, timeZone) {
    if (isDate(value)) {
        return Utilities.formatDate(value, timeZone, 'yyyy-MM-dd');
    }
    if (typeof value === 'string') {
        return value.trim();
    }
    return value;
}

// Request value -> the form the sheet's text columns are read in, so the two can
// be compared as they are. A missing key normalizes to the empty string.
function toKeyValue(value) {
    return String(value === undefined || value === null ? '' : value).trim();
}

// The sheet in one read: the sheet itself, to write back to; its header labels
// in column order, which give a field its column (0-based here, 1-based in the
// sheet); and every row below the header, where row N of the sheet is
// rows[N - 2].
function readPlanSheet() {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    // The plan sheet is the leftmost one, as in the published CSV.
    const sheet = spreadsheet.getSheets()[0];
    const lastRow = sheet.getLastRow();
    if (lastRow < 1) {
        return { sheet, fields: [], rows: [] };
    }

    const timeZone = spreadsheet.getSpreadsheetTimeZone();
    const values = sheet.getRange(1, 1, lastRow, sheet.getLastColumn()).getValues();
    return {
        sheet,
        // Wrapped rather than passed by reference: map hands its callback the
        // index as a second argument, which toFieldValue takes as a timezone.
        fields: values[0].map((value) => toFieldValue(value, timeZone)),
        rows: values.slice(1).map((row) => row.map((value) => toFieldValue(value, timeZone))),
    };
}

// Positions in `rows` of every entry with the given name and prefecture, both
// matched exactly.
function findRows(fields, rows, name, pref) {
    const nameIndex = fields.indexOf(NAME_FIELD);
    const prefIndex = fields.indexOf(PREF_FIELD);
    const found = [];
    rows.forEach((row, index) => {
        if (row[nameIndex] === name && row[prefIndex] === pref) {
            found.push(index);
        }
    });
    return found;
}

// Every entry in the sheet, as objects keyed by the header labels.
function listEntries() {
    const { fields, rows } = readPlanSheet();

    return rows
        .map((row) => {
            const entry = {};
            fields.forEach((field, index) => {
                entry[field] = row[index];
            });
            return entry;
        })
        .filter((entry) => entry[NAME_FIELD] !== '');
}

// Overwrite the fields given in `values` on the entry identified by `name` and
// `pref`. Fields left out of `values` keep their current content.
//
// Nothing is written unless exactly one entry matches: writing to the first of
// several rows would update the wrong one unnoticed. `matched` tells the two
// failures apart -- 0 is a miss, more than 1 means the sheet holds duplicate
// rows, which the key cannot split.
function updateEntry(name, pref, values) {
    const { sheet, fields, rows } = readPlanSheet();
    const found = findRows(fields, rows, toKeyValue(name), toKeyValue(pref));
    if (found.length !== 1) {
        return { updated: false, row: null, matched: found.length };
    }

    const row = found[0] + 2;
    Object.keys(values).forEach((field) => {
        sheet.getRange(row, fields.indexOf(field) + 1).setValue(values[field]);
    });

    return { updated: true, row, matched: 1 };
}
