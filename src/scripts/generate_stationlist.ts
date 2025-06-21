import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import { setTimeout } from 'timers/promises';
import * as StationCSV from '../lib/station-csv.js';
import type { Station } from '../lib/types.js';
const jaconv = require('jaconv');

const BASEURI = 'https://www.michi-no-eki.jp/';
const FETCH_INTERVAL = 1000; // 1 second in milliseconds
const STATION_FILENAME = 'data/stations.csv';

interface Prefecture {
  id: string;
  name: string;
  uri: string;
}

interface DebugOptions {
  debug: boolean;
  maxPrefectures?: number;
  maxStationsPerPref?: number;
}


function getUrl(path: string): string {
  if (path.startsWith(BASEURI)) {
    return path;
  } else {
    return new URL(path.substring(1), BASEURI).toString();
  }
}

async function fetchPage(path: string): Promise<CheerioAPI> {
  const response = await fetch(getUrl(path), {
    // Disable SSL verification equivalent
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Node.js)'
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const content = await response.text();
  return cheerio.load(content);
}

function normalizeText(text: string | null): string {
  if (text === null || text === undefined) {
    return '';
  }

  let normalized = text;

  try {
    // Use jaconv to convert zenkaku to hankaku
    normalized = jaconv.normalize(normalized, { kana: false });
  } catch (error) {
    // If normalization fails, continue with original text
  }

  // Remove line breaks
  normalized = normalized.replace(/\r?\n/g, '');

  // Replace em dash with hyphen
  normalized = normalized.replace(/－/g, '-');

  // Keep wave dash as zenkaku
  normalized = normalized.replace(/~/g, '〜');

  return normalized.trim();
}

async function* getPrefectures(): AsyncGenerator<Prefecture> {
  const $ = await fetchPage('/');

  for (const element of $('.station__list dl dd ul li a').toArray()) {
    const $element = $(element);
    const uri = $element.attr('href');
    const name = $element.text();

    if (uri) {
      const pref_id = uri.split('/')[3];
      yield { id: pref_id, name, uri };
    }
  }
}

async function* getStations(pref: Prefecture): AsyncGenerator<Station> {
  const $ = await fetchPage(pref.uri);

  // Check for next page
  const nextPageElement = $('.paging .next a');

  for (const element of $('.searchList ul li a').toArray()) {
    const $element = $(element);
    const href = $element.attr('href');

    if (!href) continue;

    const uri = getUrl(href);
    const station_id = uri.split('/').pop() || '';

    let name = '';
    let address = '';
    let tel = '';
    let hours = '';
    let lat = 'None';
    let lng = 'None';

    try {
      const $station = await fetchPage(uri);

      // Parse station details
      for (const dlElement of $station('.info dl').toArray()) {
        const $dl = $station(dlElement);
        const children = $dl.children();

        if (children.length >= 2) {
          const key = normalizeText($station(children[0]).text());
          const valueElement = $station(children[1]);
          const value = normalizeText(valueElement.text());

          switch (key) {
            case '道の駅名':
              name = value;
              break;
            case '所在地':
              address = value;
              break;
            case 'TEL':
              // Get the text of the first anchor element if it exists
              const linkElement = valueElement.find('a').first();
              tel = linkElement.length > 0 ? linkElement.text() || '' : '';
              break;
            case '営業時間':
              hours = value || '';
              break;
          }
        }
      }

      // Extract coordinates from Google Maps URL
      const stationHtml = $station.html() || '';
      const coordMatch = stationHtml.match(/www\.google\.com\/maps\/.+\?q=(.*?),(.*?)&/);
      if (coordMatch) {
        try {
          const latValue = parseFloat(coordMatch[1]);
          const lngValue = parseFloat(coordMatch[2]);

          if (!isNaN(latValue) && !isNaN(lngValue)) {
            lat = latValue.toString();
            lng = lngValue.toString();
          }
        } catch (error) {
          lat = '0';
          lng = '0';
        }
      }

      yield {
        pref_id: pref.id,
        station_id,
        name,
        address,
        tel,
        hours,
        uri,
        lat,
        lng
      };

    } catch (error) {
      console.error(`Error processing station ${uri}:`, error);
      // Continue with next station
    }
  }

  // Handle pagination
  if (nextPageElement.length > 0) {
    const nextHref = nextPageElement.attr('href');
    if (nextHref) {
      const nextPref: Prefecture = {
        id: pref.id,
        name: pref.name,
        uri: nextHref
      };
      yield* getStations(nextPref);
    }
  }
}


function getArgValue(args: string[], flag: string): number | undefined {
  // Handle --flag=value format
  for (const arg of args) {
    if (arg.startsWith(`${flag}=`)) {
      const value = parseInt(arg.split('=')[1], 10);
      return isNaN(value) ? undefined : value;
    }
  }

  // Handle --flag value format
  const index = args.indexOf(flag);
  if (index !== -1 && index + 1 < args.length) {
    const value = parseInt(args[index + 1], 10);
    return isNaN(value) ? undefined : value;
  }

  return undefined;
}

function parseArgs(): DebugOptions {
  const args = process.argv.slice(2);
  return {
    debug: args.includes('--debug'),
    maxPrefectures: getArgValue(args, '--max-prefs'),
    maxStationsPerPref: getArgValue(args, '--max-stations')
  };
}

async function main(): Promise<void> {
  const options = parseArgs();

  process.stdout.write('Fetch list of prefectures ...');
  let prefs = await Array.fromAsync(getPrefectures());

  process.stdout.write(' done\n');

  if (options.debug && options.maxPrefectures) {
    prefs = prefs.slice(0, options.maxPrefectures);
    process.stdout.write(`Debug mode: Processing first ${options.maxPrefectures} prefectures\n`);
  }

  const allStations: Station[] = [];

  for (const pref of prefs) {
    process.stdout.write(`Processing ${pref.name}(${pref.id}) ...`);

    let stationCount = 0;
    for await (const station of getStations(pref)) {
      if (options.debug && options.maxStationsPerPref &&
        stationCount >= options.maxStationsPerPref) {
        process.stdout.write(` [stopped at ${options.maxStationsPerPref} stations]`);
        break;
      }

      allStations.push(station);
      stationCount++;
      process.stdout.write('.');
      await setTimeout(FETCH_INTERVAL);
    }

    process.stdout.write(' done\n');
  }

  process.stdout.write('Writing CSV file ...');
  StationCSV.dump(allStations, STATION_FILENAME);
  process.stdout.write(' done\n');
}

if (require.main === module) {
  main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
}
