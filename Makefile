all: data/stations.geojson

clean:
	rm -rf bin/ include/ lib/

bin/python:
	virtualenv -p python2.7 .
	bin/pip install -r requirements.txt

.PHONY: data/stations.csv
data/stations.csv: bin/python
	bin/python generate_stationlist.py

.PHONY: data/stations.geojson
data/stations.geojson: data/stations.csv
	bin/python generate_geojson.py
