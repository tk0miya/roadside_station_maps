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

BASEURI = 'http://www.michi-no-eki.jp/'
FETCH_INTERVAL = 1


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

    _print('WARNING: Could not obtain geometry for %s (%s)' % (name, address))
    return None, None


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

        name = normalize_text(station.findtext('div[@class="name"]/a'))
        address = normalize_text(station.findtext('div[@class="address"]'))
        lat, lng = get_geometry(name, address)

        yield dict(pref_id=pref.get('pref_id'),
                   pref_name=pref.get('name'),
                   station_id=station_id,
                   name=name,
                   address=address,
                   tel=normalize_text(station.findtext('div[@class="tel"]')),
                   hours=normalize_text(station.findtext('div[@class="hours"]')),
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
