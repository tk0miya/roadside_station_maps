#!/usr/bin/env python
# -*- coding: utf-8 -*-

import io
import os
import lxml.html

BASEURI = 'http://www.michi-no-eki.jp/'


def get_url(path):
    return os.path.join(BASEURI, path[1:])


def get_prefectures():
    root = lxml.html.parse(get_url('/')).getroot()

    prefs = []
    for pref in root.xpath('//div[@id="prefecture"]/div/div/a'):
        prefs.append(dict(id=pref.get('id'),
                          name=pref.text,
                          uri=pref.get('href')))

    return prefs


def get_stations(pref):
    root = lxml.html.parse(get_url(pref.get('uri'))).getroot()

    stations = []
    for station in root.xpath('//ul[@id="searchList"]/li'):
        url = station.xpath('div[@class="name"]/a')[0].get('href')
        if url.endswith('/'):
            station_id = os.path.basename(url[:-1])
        else:
            station_id = os.path.basename(url)

        stations.append(dict(pref_id=pref.get('id'),
                             pref_name=pref.get('name'),
                             station_id=station_id,
                             name=station.findtext('div[@class="name"]/a'),
                             address=station.findtext('div[@class="address"]'),
                             tel=station.findtext('div[@class="tel"]'),
                             hours=station.findtext('div[@class="hours"]')))

    return stations


def get_all_stations():
    for pref in get_prefectures():
        for station in get_stations(pref):
            yield station


def main():
    last_pref = None
    with io.open('data/stations.csv', 'w', encoding='utf-8') as f:
        for station in get_all_stations():
            if last_pref != station['pref_id']:
                print 'Processing %s...' % station['pref_id']
                last_pref = station['pref_id']

            row = [station['pref_id'], station['station_id'],
                   station['name'], station['address']]
            f.write('\t'.join(row) + '\n')


main()
