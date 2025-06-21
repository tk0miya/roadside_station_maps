var React = require('react');
var ReactDOM = require('react-dom');
var RoadStationMap = require('./roadmap.tsx');

ReactDOM.render(
    <RoadStationMap />,
    document.getElementById('map-canvas')
);
