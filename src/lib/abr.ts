// The upstream of `data/cities.json`: デジタル庁 アドレス・ベース・レジストリ (ABR).
//
// Two files make a municipality: mt_city_all carries the names and the codes,
// mt_city_pos_all carries the representative points, and `lg_code` joins them.
// The representative point is the town hall's position -- 千代田区 resolves to
// 千代田区役所, 稚内市 to 稚内市役所, 檜原村 to 檜原村役場.
//
// The CDN in front of these files blocks requests from outside Japan, so this
// only runs where the machine is: not on a GitHub-hosted runner, and not in
// Claude Code's web sandbox. That is why regenerating the table is a command
// someone runs rather than a scheduled job.
//
// This module only knows how to get typed rows out of ABR. What a municipality
// is, and which rows make one, is `cities-master.ts`.

import { parse } from 'csv-parse/sync';
import { unzipSync } from 'fflate';

// Where a moved file can be found again. The direct links below are stable
// enough to hardcode, but they are not the published interface -- the catalogue
// is, and it returns the current link in `properties.url`. Kept in the error
// message rather than only in the docs, because whoever hits the failure is
// watching a command fail, not reading documentation.
const HUB_ITEM_URL = 'https://dataset.address-br.digital.go.jp/api/search/v1/collections/all/items/';

const USER_AGENT = 'roadside_station_maps (+https://github.com/tk0miya/roadside_station_maps)';

interface Source {
    name: string;
    url: string;
    hubId: string;
    // Columns this module hands on. Checked on every run so that a rename
    // upstream stops the command instead of silently emptying a field.
    columns: readonly string[];
}

// One municipality as ABR spells it. 郡 and 政令市の区 are separate columns, not
// part of `city`, so the display name is assembled rather than parsed.
//
// `efct_date` / `ablt_date` are the days the row takes effect and ceases to.
// ABR publishes a merger before it happens, so both matter.
export interface AbrCity {
    lg_code: string;
    pref: string;
    county: string;
    city: string;
    ward: string;
    efct_date: string;
    ablt_date: string;
}

export interface AbrPosition {
    lg_code: string;
    rep_lon: string;
    rep_lat: string;
}

const CITY_SOURCE: Source = {
    name: 'mt_city_all',
    url: 'https://data.address-br.digital.go.jp/mt_city/mt_city_all.csv.zip',
    hubId: '5e130d8117c6426fa1f53a5dbf90cb74',
    columns: ['lg_code', 'pref', 'county', 'city', 'ward', 'efct_date', 'ablt_date'],
};

const POSITION_SOURCE: Source = {
    name: 'mt_city_pos_all',
    url: 'https://data.address-br.digital.go.jp/mt_city_pos/mt_city_pos_all.csv.zip',
    hubId: '7108b74d9fad4e79997538ec40aa8015',
    columns: ['lg_code', 'rep_lon', 'rep_lat'],
};

async function download(source: Source): Promise<Uint8Array> {
    const response = await fetch(source.url, { headers: { 'User-Agent': USER_AGENT } });
    if (!response.ok) {
        // The body carries the reason when the refusal comes from the CDN rather
        // than the origin -- a blocked network, a rate limit -- which a status
        // code alone does not distinguish from the file having moved. Stripped
        // of tags because that reason arrives as an HTML error page, where the
        // first few hundred characters are otherwise all doctype and <head>.
        const body = (await response.text().catch(() => ''))
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 300);
        throw new Error(
            `Failed to fetch ${source.name}: HTTP ${response.status} from ${source.url}. Body: ${body} -- if the ` +
                `file moved, the current link is in properties.url of ${HUB_ITEM_URL}${source.hubId}`
        );
    }
    return new Uint8Array(await response.arrayBuffer());
}

// The archives hold a single CSV each. Selecting by extension rather than by
// position keeps a future sibling file (a readme, a checksum) from being parsed
// as the data.
function extractCsv(source: Source, archive: Uint8Array): string {
    const entries = unzipSync(archive);
    const names = Object.keys(entries).filter((name) => name.endsWith('.csv'));
    if (names.length !== 1) {
        throw new Error(
            `Expected one CSV in ${source.name}, found ${names.length} (archive holds: ${Object.keys(entries).join(', ')})`
        );
    }
    return new TextDecoder().decode(entries[names[0]]);
}

function parseRows(source: Source, csv: string): Record<string, string>[] {
    const rows = parse(csv, { columns: true, bom: true, skip_empty_lines: true }) as Record<string, string>[];
    if (rows.length === 0) {
        throw new Error(`${source.name} holds no rows.`);
    }

    // Read by column name, never by position: a column added upstream would
    // shift every field after it, and nothing downstream would notice.
    const header = Object.keys(rows[0]);
    const missing = source.columns.filter((column) => !header.includes(column));
    if (missing.length > 0) {
        throw new Error(`${source.name} is missing column(s): ${missing.join(', ')}. It has: ${header.join(', ')}`);
    }

    return rows;
}

async function fetchRows(source: Source): Promise<Record<string, string>[]> {
    return parseRows(source, extractCsv(source, await download(source)));
}

export async function fetchCities(): Promise<AbrCity[]> {
    const rows = await fetchRows(CITY_SOURCE);
    return rows.map((row) => ({
        lg_code: row.lg_code,
        pref: row.pref,
        county: row.county,
        city: row.city,
        ward: row.ward,
        efct_date: row.efct_date,
        ablt_date: row.ablt_date,
    }));
}

export async function fetchPositions(): Promise<AbrPosition[]> {
    const rows = await fetchRows(POSITION_SOURCE);
    return rows.map((row) => ({
        lg_code: row.lg_code,
        rep_lon: row.rep_lon,
        rep_lat: row.rep_lat,
    }));
}
