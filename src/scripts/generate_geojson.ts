#!/usr/bin/env node

import * as fs from 'fs';

const STATION_FILENAME = 'data/stations.csv';
const OUTPUT_FILENAME = 'data/stations.geojson';

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

interface GeoJSONFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
  properties: {
    pref_id: string;
    station_id: string;
    name: string;
    address: string;
    tel: string;
    hours: string;
    uri: string;
  };
}

interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

function loadStationList(filename: string): Station[] {
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

function convertFeature(station: Station): GeoJSONFeature | null {
  if (station.lat === 'None' || station.lng === 'None') {
    return null;
  }

  const lat = parseFloat(station.lat);
  const lng = parseFloat(station.lng);

  if (isNaN(lat) || isNaN(lng)) {
    return null;
  }

  return {
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [lng, lat]
    },
    properties: {
      pref_id: station.pref_id,
      station_id: station.station_id,
      name: station.name,
      address: station.address,
      tel: station.tel,
      hours: station.hours,
      uri: station.uri
    }
  };
}

function main(): void {
  const stations = loadStationList(STATION_FILENAME);
  const features = stations
    .map(convertFeature)
    .filter((feature): feature is GeoJSONFeature => feature !== null);

  const featureCollection: GeoJSONFeatureCollection = {
    type: 'FeatureCollection',
    features
  };

  const json = JSON.stringify(featureCollection);
  fs.writeFileSync(OUTPUT_FILENAME, json, 'utf-8');
}

if (require.main === module) {
  main();
}
