#!/usr/bin/env python
# -*- coding: utf-8 -*-

import io
import geojson
from geojson import Feature, Point, FeatureCollection


def get_stations():
    with io.open('data/stations.csv', 'r', encoding='utf-8') as f:
        for line in f:
            yield line.strip().split('\t')


def convert_feature(station):
    pref_id, station_id, name, address, lat, lng = station
    if lat == 'None' or lng == 'None':
        return None

    geometry = Point((float(lng), float(lat)))
    properties = dict(pref_id=pref_id, station_id=station_id,
                      name=name, address=address)
    return Feature(geometry=geometry, properties=properties)


def main():
    features = (convert_feature(s) for s in get_stations())
    with io.open('data/stations.geojson', 'w', encoding='utf-8') as f:
        json = geojson.dumps(FeatureCollection(filter(bool, features)),
                             ensure_ascii=False)
        f.write(json)


main()
