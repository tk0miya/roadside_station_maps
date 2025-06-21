// @ts-ignore
var React = require('react');
var ReactDOM = require('react-dom');
// @ts-ignore
var RoadStationMap = require('./roadmap.tsx');

ReactDOM.render(
    <RoadStationMap />,
    document.getElementById('map-canvas')
);

// Export to make this file a module and avoid global scope conflicts
export {};
