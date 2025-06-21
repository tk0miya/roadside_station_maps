import * as fs from 'fs';
import * as path from 'path';
import type { Station } from './types.js';

export function load(filename: string): Station[] {
  const content = fs.readFileSync(filename, 'utf-8');
  const lines = content.trim().split('\n');

  return lines.map((line: string) => {
    const [pref_id, station_id, name, address, tel, hours, uri, lat, lng] = line.split('\t');
    return {
      pref_id,
      station_id,
      name,
      address,
      tel,
      hours,
      uri,
      lat,
      lng
    };
  });
}

export function dump(stations: Station[], filename: string): void {
  // Ensure directory exists
  const dir = path.dirname(filename);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const writeStream = fs.createWriteStream(filename, { encoding: 'utf-8' });

  try {
    for (const station of stations) {
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
    }
  } finally {
    writeStream.end();
  }
}