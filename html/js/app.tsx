import React from 'react'; // Used for JSX
import ReactDOM from 'react-dom';
import { RoadStationMap } from './roadmap.tsx';

ReactDOM.render(
    <RoadStationMap />,
    document.getElementById('map-canvas')
);
