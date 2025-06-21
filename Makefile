all: data/stations.geojson

clean:
	rm -rf bin/ include/ lib/

bin/python:
	virtualenv -p python3.10 .
	bin/pip install -r requirements.txt

.PHONY: data/stations.csv
data/stations.csv:
	npm run generate:stations

.PHONY: data/stations.geojson
data/stations.geojson: data/stations.csv
	npm run generate:geojson
