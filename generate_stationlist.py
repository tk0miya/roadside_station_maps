#!/usr/bin/env python
# -*- coding: utf-8 -*-

from __future__ import print_function

import io
import os
import re
import sys
import lxml.html
import geocoder
from time import sleep
from mojimoji import zen_to_han
from collections import namedtuple

BASEURI = 'http://www.michi-no-eki.jp/'
FETCH_INTERVAL = 1
STATION_FILENAME = 'data/stations.csv'


Prefecture = namedtuple('Prefecture', ['id', 'name', 'uri'])
Station = namedtuple('Station', ['pref_id', 'station_id', 'name', 'address', 'uri', 'tel', 'hours', 'lat', 'lng'])


class StationList(list):
    def find_by_id(self, pref_id, station_id):
        for station in self:
            if station.pref_id == pref_id and station.station_id == station_id:
                return station
        else:
            return None


def get_url(path):
    return os.path.join(BASEURI, path[1:])


def normalize_text(text):
    try:
        text = zen_to_han(text, kana=False)
    except TypeError:
        pass  # non-unicode object

    text = re.sub(u'\r?\n', '', text, re.M)
    text = re.sub(u'－', '-', text, re.M)
    return text


def get_geometry(name, address):
    address = address.replace(u'土佐町田井字桜ヶ内', u'土佐町田井字')  # 土佐さめうら 対応

    addresses = [address,
                 re.sub('([0-9\-]+)', ' \\1', address),
                 u'道の駅 ' + name]
    for addr in addresses:
        geometry = geocoder.google(addr).latlng
        if geometry:
            return geometry

    raise ValueError


def get_prefectures():
    root = lxml.html.parse(get_url('/')).getroot()
    for pref in root.xpath('//div[@id="prefecture"]/div/div/a'):
        yield Prefecture(pref.get('id'), pref.text, pref.get('href'))


def get_stations(pref, old_station_list):
    root = lxml.html.parse(get_url(pref.uri)).getroot()

    for station in root.xpath('//ul[@id="searchList"]/li'):
        uri = station.xpath('div[@class="name"]/a')[0].get('href')
        if uri.endswith('/'):
            station_id = os.path.basename(uri[:-1])
        else:
            station_id = os.path.basename(uri)

        old_station = old_station_list.find_by_id(pref.id, station_id)

        name = normalize_text(station.findtext('div[@class="name"]/a'))
        address = normalize_text(station.findtext('div[@class="address"]'))
        tel = normalize_text(station.findtext('div[@class="tel"]'))
        hours = normalize_text(station.findtext('div[@class="hours"]'))
        try:
            lat, lng = get_geometry(name, address)
            if old_station:
                if old_station.lat != str(lat) or old_station.lng != str(lng):
                    _print('WARNING: Geometry for %s has been changed: (%s, %s) -> (%s, %s)' %
                           (name, old_station.lat, old_station.lng, lat, lng))
        except ValueError:
            if old_station:
                lat = old_station.lat
                lng = old_station.lng
                _print('WARNING: Could not obtain geometry for %s, but filled by old data' % (name,))
            else:
                _print('WARNING: Could not obtain geometry for %s (%s)' % (name, address))
                lat, lng = None, None

        yield Station(pref.id, station_id, name, address, uri, tel, hours, lat, lng)


def _print(text, flush=False, **kwargs):
    print(text, **kwargs)
    if flush:
        sys.stdout.flush()


def load_station_list(filename):
    stations = StationList()
    with io.open(filename, 'r', encoding='utf-8') as f:
        for line in f:
            data = line.strip().split('\t')
            stations.append(Station(data[0], data[1], data[2], data[3],
                                    '<uri>', '<tel>', '<hours>', data[4], data[5]))

    return stations


def main():
    old_stations_list = load_station_list(STATION_FILENAME)
    with io.open(STATION_FILENAME, 'w', encoding='utf-8') as f:
        _print('Fetch list of prefectures ...', end='', flush=True)
        prefs = list(get_prefectures())
        _print(' done')

        for pref in prefs:
            _print('Processing %s ...' % pref.id, end='', flush=True)
            for station in get_stations(pref, old_stations_list):
                row = [station.pref_id, station.station_id,
                       station.name, station.address,
                       str(station.lat), str(station.lng)]
                f.write('\t'.join(row) + '\n')
                _print('.', end='', flush=True)

            _print(' done')
            sleep(FETCH_INTERVAL)


main()
