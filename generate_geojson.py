#!/usr/bin/env python
# -*- coding: utf-8 -*-

import io
import geojson
from geojson import Feature, Point, FeatureCollection
from generate_stationlist import STATION_FILENAME, load_station_list


def convert_feature(station):
    if station.lat == 'None' or station.lng == 'None':
        return None

    geometry = Point((float(station.lng), float(station.lat)))
    properties = dict(pref_id=station.pref_id, station_id=station.station_id,
                      name=station.name, address=station.address)
    return Feature(geometry=geometry, properties=properties)


def main():
    stations = load_station_list(STATION_FILENAME)
    features = (convert_feature(s) for s in stations)
    with io.open('data/stations.geojson', 'w', encoding='utf-8') as f:
        json = geojson.dumps(FeatureCollection(filter(bool, features)),
                             ensure_ascii=False)
        f.write(json)


if __name__ == '__main__':
    main()
