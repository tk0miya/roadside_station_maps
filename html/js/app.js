var React = require('react');
var ReactDOM = require('react-dom');
var RoadStationMap = require('./roadmap');
var Sidebar = require('./sidebar');

var RoadStationApp = React.createClass({
    onMapIdled: function() {
        var map = this.refs.roadmap.map;
        var bounds = map.getBounds();

        var stations = [];
        map.data.forEach(function(feature){
            if (bounds.contains(feature.getGeometry().get())) {
                stations.push(feature);
            }
        });

        this.refs.sidebar.setState({ zoom: map.getZoom(), stations: stations });
    },
    onStationSelected: function(feature) {
        this.refs.roadmap.onMarkerClicked(feature);
    },
    render: function() {
        return (
            <div id="map-wrapper" className="clearfix">
                <Sidebar ref="sidebar" onStationSelected={this.props.onStationSelected} />
                <RoadStationMap ref="roadmap" onMapIdled={this.onMapIdled} />
            </div>
        );
    }
});

ReactDOM.render(
    <RoadStationApp />,
    document.getElementById('map-container')
);
