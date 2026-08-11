// Slack notification for the research recorded through the web app.
//
// The Incoming Webhook URL is a secret, and this project's script properties are
// the only place it lives -- set by hand in the Apps Script editor, never in this
// repository. The `npm run plan` CLI is deliberately not given it: the machine
// running the research holds no credential at all. That is also why a report
// which cannot be written to the sheet is relayed through here instead of being
// posted by the client.
//
// The row's link comes from plan.js (rowUrl); nothing here touches the
// Spreadsheet service itself.
//
// UrlFetchApp needs the script.external_request scope, and the web app runs as
// USER_DEPLOYING, so /exec fails until the deploying account authorizes it: after
// `npm run gas:push`, run a function once in the editor. Once granted, it stays
// granted.

const WEBHOOK_PROPERTY = 'SLACK_WEBHOOK_URL';

// The column every update stamps. A research pass that found nothing still
// writes it, so a change to it alone is not worth a notification: a session
// updates ten entries and most of them change nothing else.
const CHECKED_ON_FIELD = 'checked_on';

// The column holding the sources, rendered differently from the rest below.
const MEMO_FIELD = 'memo';

function getWebhookUrl() {
    const url = PropertiesService.getScriptProperties().getProperty(WEBHOOK_PROPERTY);
    if (!url) {
        throw new Error(`${WEBHOOK_PROPERTY} is not set in this project's script properties.`);
    }
    return url;
}

// Slack reads & < > as markup, so anything taken from the sheet or from the CLI
// is escaped before being placed in a message: a report reading "date が <未定>
// 表記になっている" would otherwise lose those words to a broken link. The row
// link's URL is escaped as well -- its query separator is an ampersand.
function escapeText(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// An empty cell reads as nothing at all in a message, so it is named instead.
function formatValue(value) {
    return value === '' ? '(empty)' : escapeText(value);
}

function formatChange(change) {
    return `${formatValue(change.from)} → ${formatValue(change.to)}`;
}

// memo holds one source per line -- a markdown link, or a bare URL for the older
// entries -- and is appended to rather than replaced, so it reads as a
// line-by-line diff: showing it as a before and after would fill the message with
// sources that were already there. The links are left as they are written, which
// Slack shows literally; what this has to make obvious is which lines moved, not
// which page each one points at.
//
// Removed lines are listed as well, even though an append should never produce
// one. Appending means reading the column and writing it back, which quietly
// drops every existing source if the read came back empty -- a write that succeeds
// and looks ordinary, so nothing about it gives the loss away.
function formatMemoChange(change) {
    const before = toLines(change.from);
    const after = toLines(change.to);
    const added = after.filter((line) => !before.includes(line));
    const removed = before.filter((line) => !after.includes(line));

    // Neither, yet something changed: the same lines in a different arrangement --
    // reordered, respaced, or one of them appended a second time, which is what a
    // source already in the column comes out as. Nothing was gained or lost, so
    // there is nothing to list; printing the column whole would be a screen of
    // links saying as much.
    if (added.length === 0 && removed.length === 0) {
        return '(same sources, rearranged)';
    }

    // Indented so the lines after the first still read as part of the memo line
    // they belong to.
    return added
        .map((line) => `+${escapeText(line)}`)
        .concat(removed.map((line) => `-${escapeText(line)}`))
        .join('\n  ');
}

function toLines(value) {
    return String(value)
        .split('\n')
        .filter((line) => line !== '');
}

// The message for one research pass, or null when there is nothing to say: no
// field changed beyond the stamp, and no report was given.
function buildMessage(name, pref, row, changes, report) {
    const fields = Object.keys(changes).filter((field) => field !== CHECKED_ON_FIELD);
    if (fields.length === 0 && !report) {
        return null;
    }

    const lines = [`*${escapeText(name)}* ${escapeText(pref)} <${escapeText(rowUrl(row))}|row ${row}>`];
    fields.forEach((field) => {
        const change = changes[field];
        lines.push(`• ${field}: ${field === MEMO_FIELD ? formatMemoChange(change) : formatChange(change)}`);
    });
    if (report) {
        lines.push(`*Report:* ${escapeText(report)}`);
    }

    return lines.join('\n');
}

// Post what one research pass found, if it is worth a message. Exceptions are
// left to the caller, which has already written to the sheet by the time this
// runs; see doPost.
function notifyResearch(name, pref, row, changes, report) {
    const message = buildMessage(name, pref, row, changes, report);
    if (message === null) {
        return;
    }

    // UrlFetchApp throws on a non-2xx response unless told otherwise, which is
    // what is wanted here: a rejected webhook is a failure to report.
    UrlFetchApp.fetch(getWebhookUrl(), {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({ text: message }),
    });
}
