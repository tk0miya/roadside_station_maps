#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { CheerioAPI, load } from 'cheerio';
const jaconv = require('jaconv');

const BASEURI = 'https://www.michi-no-eki.jp/';
const FETCH_INTERVAL = 1000; // 1 second in milliseconds
const STATION_FILENAME = 'data/stations.csv';

interface Prefecture {
  id: string;
  name: string;
  uri: string;
}

interface Station {
  pref_id: string;
  station_id: string;
  name: string;
  address: string;
  tel: string;
  hours: string;
  uri: string;
  lat: string;
  lng: string;
}

class StationList extends Array<Station> {
  findById(pref_id: string, station_id: string): Station | undefined {
    return this.find(station =>
      station.pref_id === pref_id && station.station_id === station_id
    );
  }
}

function getUrl(path: string): string {
  if (path.startsWith(BASEURI)) {
    return path;
  } else {
    return new URL(path.substring(1), BASEURI).toString();
  }
}

async function fetchPage(path: string): Promise<string> {
  const response = await fetch(getUrl(path), {
    // Disable SSL verification equivalent
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Node.js)'
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return await response.text();
}

function parseHtml(content: string): CheerioAPI {
  return load(content);
}

function zenToHan(text: string): string {
  // Use jaconv to convert zenkaku to hankaku (excluding kana)
  return jaconv.normalize(text, { kana: false });
}

function normalizeText(text: string | null): string {
  if (text === null || text === undefined) {
    return '';
  }

  let normalized = text;

  try {
    normalized = zenToHan(normalized);
  } catch (error) {
    // If zen_to_han fails, continue with original text
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
  const content = await fetchPage('/');
  const $ = parseHtml(content);

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
  const content = await fetchPage(pref.uri);
  const $ = parseHtml(content);

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
      const stationContent = await fetchPage(uri);
      const $ = parseHtml(stationContent);

      // Parse station details
      for (const dlElement of $('.info dl').toArray()) {
        const $dl = $(dlElement);
        const children = $dl.children();

        if (children.length >= 2) {
          const key = normalizeText($(children[0]).text());
          const valueElement = $(children[1]);
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
      const coordMatch = stationContent.match(/www\.google\.com\/maps\/.+\?q=(.*?),(.*?)&/);
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

function print(text: string, options: { end?: string; flush?: boolean } = {}): void {
  if (options.end !== undefined) {
    process.stdout.write(text + options.end);
  } else {
    console.log(text);
  }

  if (options.flush) {
    // Node.js automatically flushes stdout, but we can ensure it
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// @ts-ignore - Keep for future use
async function loadStationList(filename: string): Promise<StationList> {
  const stations = new StationList();

  try {
    const content = fs.readFileSync(filename, 'utf-8');
    const lines = content.trim().split('\n');

    for (const line of lines) {
      const data = line.split('\t');
      if (data.length >= 9) {
        stations.push({
          pref_id: data[0],
          station_id: data[1],
          name: data[2],
          address: data[3],
          tel: data[4],
          hours: data[5],
          uri: data[6],
          lat: data[7],
          lng: data[8]
        });
      }
    }
  } catch (error) {
    // File doesn't exist, return empty list
  }

  return stations;
}

async function main(): Promise<void> {
  // Ensure data directory exists
  const dataDir = path.dirname(STATION_FILENAME);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const writeStream = fs.createWriteStream(STATION_FILENAME, { encoding: 'utf-8' });

  try {
    print('Fetch list of prefectures ...', { end: '', flush: true });
    const prefs: Prefecture[] = [];

    for await (const pref of getPrefectures()) {
      prefs.push(pref);
    }

    print(' done');

    for (const pref of prefs) {
      print(`Processing ${pref.name}(${pref.id}) ...`, { end: '', flush: true });

      for await (const station of getStations(pref)) {
        const row = [
          station.pref_id,
          station.station_id,
          station.name,
          station.address,
          station.tel,
          station.hours,
          station.uri,
          station.lat,
          station.lng
        ];

        writeStream.write(row.join('\t') + '\n');
        print('.', { end: '', flush: true });

        await sleep(FETCH_INTERVAL);
      }

      print(' done');
    }

  } finally {
    writeStream.end();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
}
