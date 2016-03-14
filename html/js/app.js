var React = require('react');
var ReactDOM = require('react-dom');
var RoadStationMap = require('./roadmap');

ReactDOM.render(
    React.createElement(RoadStationMap),
    document.getElementById('map-canvas')
);
