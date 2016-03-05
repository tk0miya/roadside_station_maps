#!/usr/bin/env python
# -*- coding: utf-8 -*-

from __future__ import print_function

import io
import os
import sys
import lxml.html
import geocoder
from time import sleep

BASEURI = 'http://www.michi-no-eki.jp/'
FETCH_INTERVAL = 1


def get_url(path):
    return os.path.join(BASEURI, path[1:])


def get_prefectures():
    root = lxml.html.parse(get_url('/')).getroot()
    for pref in root.xpath('//div[@id="prefecture"]/div/div/a'):
        yield dict(pref_id=pref.get('id'),
                   name=pref.text,
                   uri=pref.get('href'))


def get_stations(pref):
    root = lxml.html.parse(get_url(pref.get('uri'))).getroot()

    for station in root.xpath('//ul[@id="searchList"]/li'):
        url = station.xpath('div[@class="name"]/a')[0].get('href')
        if url.endswith('/'):
            station_id = os.path.basename(url[:-1])
        else:
            station_id = os.path.basename(url)

        address = station.findtext('div[@class="address"]').replace('\n', '')
        try:
            lat, lng = geocoder.google(address).latlng
        except:
            lat, lng = None, None

        yield dict(pref_id=pref.get('pref_id'),
                   pref_name=pref.get('name'),
                   station_id=station_id,
                   name=station.findtext('div[@class="name"]/a'),
                   address=station.findtext('div[@class="address"]'),
                   tel=station.findtext('div[@class="tel"]'),
                   hours=station.findtext('div[@class="hours"]'),
                   lat=lat,
                   lng=lng)


def _print(text, flush=False, **kwargs):
    print(text, **kwargs)
    if flush:
        sys.stdout.flush()


def main():
    last_pref = None
    with io.open('data/stations.csv', 'w', encoding='utf-8') as f:
        _print('Fetch list of prefectures ...', end='', flush=True)
        prefs = list(get_prefectures())
        _print(' done')

        for pref in prefs:
            _print('Processing %s ...' % pref['pref_id'], end='', flush=True)
            for station in get_stations(pref):
                if last_pref != station['pref_id']:
                    last_pref = station['pref_id']

                row = [station['pref_id'], station['station_id'],
                       station['name'], station['address'],
                       str(station['lat']), str(station['lng'])]
                f.write('\t'.join(row) + '\n')
                _print('.', end='', flush=True)

            _print(' done')
            sleep(FETCH_INTERVAL)


main()
