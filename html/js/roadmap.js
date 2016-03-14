var jQuery = require('jquery');
var React = require('react');
var ReactDOM = require('react-dom');
var request = require('request');

var RoadStation = require('./roadstation');

var RoadStationMap = React.createClass({
    getInitialState: function() {
        return { data: null };
    },
    componentDidMount: function() {
        this.map = new google.maps.Map(ReactDOM.findDOMNode(this), {
            center: { lat: 35.6896342, lng: 139.6921007 }, // Shinjuku, Tokyo
            zoom: 9
        });
        this.infowindow = new google.maps.InfoWindow();
        this.initInfoWindow()

        jQuery.getJSON('../data/stations.geojson', this.onGeoJSONLoaded);
    },
    render: function() {
        return React.createElement('div', { className: 'map-canvas' });
    },
    initInfoWindow: function() {
        var self = this;
        var switcher = jQuery('<a />').attr('href', '#')
        switcher[0].innerText = 'マーカーの色を変える';
        switcher.on('click', function() {
            var station = new RoadStation(self.infowindow.feature);
            self.map.data.overrideStyle(self.infowindow.feature, station.changeStyle());
            self.infowindow.close();
        });

        var root = document.createElement("div");
        jQuery('<div/>').appendTo(root);
        jQuery('<div/>').appendTo(root);
        jQuery('<div/>').append(switcher).appendTo(root);

        this.infowindow.setContent(root);
        this.infowindow.setOptions({pixelOffset: new google.maps.Size(0, -30)});
    },
    onGeoJSONLoaded: function(data) {
        this.map.addListener("click", this.onMapClicked);
        this.map.data.addGeoJson(data);
        this.map.data.addListener('click', this.onMarkerClicked);
        this.map.data.addListener('dblclick', this.onMarkerDoubleClicked);
        this.map.data.setStyle(function(feature) {
            return new RoadStation(feature).getStyle();
        });
    },
    onMapClicked: function() {
        this.infowindow.close();
    },
    onMarkerClicked: function(event) {
        var station = new RoadStation(event.feature);
        if (this.infowindow.getMap() && this.infowindow.feature == station.feature) {
            this.map.data.overrideStyle(event.feature, station.changeStyle());
        } else {
            this.infowindow.content.children[0].innerText = station.name;
            this.infowindow.content.children[1].innerText = "(" + station.address + ")";
            this.infowindow.setPosition(station.feature.getGeometry().get());
            this.infowindow.feature = station.feature;
            this.infowindow.open(this.map);
        }
    },
    onMarkerDoubleClicked: function(event) {
        var station = new RoadStation(event.feature);
        this.map.data.overrideStyle(event.feature, station.changeStyle());
        this.infowindow.close();
    }
});

module.exports = RoadStationMap;
