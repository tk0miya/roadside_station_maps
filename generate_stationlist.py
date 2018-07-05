#!/usr/bin/env python
# -*- coding: utf-8 -*-

from __future__ import print_function

import io
import os
import re
import sys
import requests
import lxml.html
from time import sleep
from mojimoji import zen_to_han
from collections import namedtuple
from requests.packages import urllib3

BASEURI = 'https://www.michi-no-eki.jp/'
FETCH_INTERVAL = 1
STATION_FILENAME = 'data/stations.csv'

# disable SSL warnings
urllib3.disable_warnings()

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


def fetch_page(path):
    res = requests.get(get_url(path), verify=False)
    return res.content


def parse_html(content):
    return lxml.html.fromstring(content)


def normalize_text(text):
    if text is None:
        return text

    try:
        text = zen_to_han(text, kana=False)
    except TypeError:
        pass

    text = re.sub(u'\r?\n', '', text, re.M)
    text = re.sub(u'－', '-', text, re.M)
    text = re.sub('~', u'〜', text, re.M)  # keep wave dash as zenkaku
    return text


def get_prefectures():
    root = parse_html(fetch_page('/stations/search'))
    for pref in root.xpath('//div[@class="clearfix"]/ul/li/a'):
        uri = pref.get('href')
        pref_id = uri.split('=')[-1]
        yield Prefecture(pref_id, pref.text, uri)


def get_stations(pref, old_station_list):
    root = parse_html(fetch_page(pref.uri))

    for entry in root.xpath('//div[@class="resultStation"]/div/h4/a'):
        uri = get_url(entry.get('href'))
        station_id = uri.split('/')[-1]
        name = None
        address = None
        tel = None
        hours = None
        lat = None
        lng = None

        content = fetch_page(uri)
        root = parse_html(content)
        for station in root.xpath('//div[@id="stationFeature"]/table/tr'):
            key = normalize_text(station[0].text)
            value = normalize_text(station[1].text)
            if key == u'道の駅名':
                name = value
            elif key == u'所在地':
                address = value
            elif key == u'TEL':
                tel = value
            elif key == u'営業時間':
                hours = value

        matched = re.search('www.google.com/maps/.+\?q=(.*),(.*)&', content)
        if matched:
            lat = float(matched.group(1))
            lng = float(matched.group(2))

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
                                    data[4], '<tel>', '<hours>', data[5], data[6]))

    return stations


def main():
    old_stations_list = load_station_list(STATION_FILENAME)
    with io.open(STATION_FILENAME, 'w', encoding='utf-8') as f:
        _print('Fetch list of prefectures ...', end='', flush=True)
        prefs = list(get_prefectures())
        _print(' done')

        for pref in prefs:
            _print('Processing %s(%s) ...' % (pref.name, pref.id), end='', flush=True)
            for station in get_stations(pref, old_stations_list):
                row = [station.pref_id, station.station_id,
                       station.name, station.address, station.uri,
                       str(station.lat), str(station.lng)]
                f.write('\t'.join(row) + '\n')
                _print('.', end='', flush=True)
                sleep(FETCH_INTERVAL)

            _print(' done')


if __name__ == '__main__':
    main()
