import * as fs from 'fs';
import * as StationCSV from '../lib/station-csv.js';
import type { Station } from '../lib/types.js';

const STATION_FILENAME = 'data/stations.csv';
const OUTPUT_FILENAME = 'data/stations.geojson';

interface GeoJSONFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
  properties: {
    prefId: string;
    stationId: string;
    internalId: string;
    name: string;
    address: string;
    tel: string;
    hours: string;
    uri: string;
    mapcode: string;
  };
}

interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}


function convertFeature(station: Station, internalId: number): GeoJSONFeature | null {
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
      prefId: station.prefId,
      stationId: station.stationId,
      internalId: internalId.toString(),
      name: station.name,
      address: station.address,
      tel: station.tel,
      hours: station.hours,
      uri: station.uri,
      mapcode: station.mapcode
    }
  };
}

function main(): void {
  const stations = StationCSV.load(STATION_FILENAME);
  
  // Sort by stationId for stable internal ID assignment
  const features = stations
    .sort((a, b) => parseInt(a.stationId) - parseInt(b.stationId))
    .map((station, index) => convertFeature(station, index))
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
