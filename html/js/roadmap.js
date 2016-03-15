var jQuery = require('jquery');
var React = require('react');
var ReactDOM = require('react-dom');
var request = require('request');

var RoadStation = require('./roadstation');

var InfoWindow = React.createClass({
    propTypes: {
        element: React.PropTypes.object,
        map: React.PropTypes.object,
        onClick: React.PropTypes.func
    },
    getInitialState: function() {
        return { feature: null };
    },
    componentDidMount: function() {
        this.infowindow = new google.maps.InfoWindow();
        this.infowindow.addListener("closeclick", this.close);
        this.infowindow.setOptions({pixelOffset: new google.maps.Size(0, -30)});
    },
    componentDidUpdate: function() {
        this.infowindow.setContent(this.props.element);
        if (this.state.feature) {
            this.infowindow.open(this.props.map);
        } else {
            this.infowindow.close();
        }
    },
    onClick: function() {
        this.props.onClick(this.state.feature);
    },
    open: function(feature) {
        this.setState({ feature: feature });
    },
    close: function() {
        this.setState({ feature: null });
    },
    isOpenedFor: function(feature) {
        if (this.infowindow.getMap() && this.state.feature == feature) {
            return true;
        } else {
            return false;
        }
    },
    render: function() {
        if (this.state.feature == null) {
            return <div />;
        } else {
            this.infowindow.setPosition(this.state.feature.getGeometry().get());
            var station = new RoadStation(this.state.feature);
            return (
                <div>
                    <div>{station.name}</div>
                    <div>({station.address})</div>
                    <a href="#" onClick={this.onClick}>マーカーの色を変える</a>
                </div>
            );
        }
    }
});

var InfoWindowFactory = function(map, onClick) {
    var element = document.createElement("div");
    return ReactDOM.render(
        <InfoWindow map={map} onClick={onClick} element={element} />,
        element
    );
};

var RoadStationMap = React.createClass({
    getInitialState: function() {
        return { data: null };
    },
    componentDidMount: function() {
        this.map = new google.maps.Map(ReactDOM.findDOMNode(this), {
            center: { lat: 35.6896342, lng: 139.6921007 }, // Shinjuku, Tokyo
            zoom: 9
        });
        this.infowindow = InfoWindowFactory(this.map, this.onMarkerStyleModifierClicked);

        jQuery.getJSON('../data/stations.geojson', this.onGeoJSONLoaded);
    },
    render: function() {
        return React.createElement('div', { className: 'map-canvas' });
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
    onMarkerStyleModifierClicked: function(feature) {
        var station = new RoadStation(feature);
        this.map.data.overrideStyle(feature, station.changeStyle());
        this.infowindow.close();
    },
    onMarkerClicked: function(event) {
        if (this.infowindow.isOpenedFor(event.feature)) {
            var station = new RoadStation(event.feature);
            this.map.data.overrideStyle(event.feature, station.changeStyle());
        } else {
            this.infowindow.open(event.feature)
        }
    },
    onMarkerDoubleClicked: function(event) {
        var station = new RoadStation(event.feature);
        this.map.data.overrideStyle(event.feature, station.changeStyle());
        this.infowindow.close();
    }
});

module.exports = RoadStationMap;
