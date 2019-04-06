#!/usr/bin/env python
# -*- coding: utf-8 -*-

import io
import geojson
from geojson import Feature, Point, FeatureCollection
from generate_stationlist import STATION_FILENAME, load_station_list


STATION_ID_MAPPING_FILENAME = 'data/stations_id_mapping.csv'


def load_station_id_mapping(filename):
    mapping = {}
    with io.open(filename, 'r', encoding='utf-8') as f:
        for line in f:
            pref_id, station_id, name = line.strip().split('\t')
            mapping[name] = "/".join([pref_id, station_id])

    return mapping


def convert_feature(station, old_station_ids):
    if station.lat == 'None' or station.lng == 'None':
        return None

    geometry = Point((float(station.lng), float(station.lat)))
    properties = dict(pref_id=station.pref_id, station_id=station.station_id,
                      name=station.name, address=station.address,
                      hours=station.hours, uri=station.uri,
                      old_station_id=old_station_ids.get(station.name, None))
    return Feature(geometry=geometry, properties=properties)


def main():
    stations = load_station_list(STATION_FILENAME)
    old_statioN_ids = load_station_id_mapping(STATION_ID_MAPPING_FILENAME)
    features = (convert_feature(s, old_statioN_ids) for s in stations)
    with io.open('data/stations.geojson', 'w', encoding='utf-8') as f:
        json = geojson.dumps(FeatureCollection(list(filter(bool, features))),
                             ensure_ascii=False)
        f.write(json)


if __name__ == '__main__':
    main()
