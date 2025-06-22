import { createRoot } from 'react-dom/client';
import { RoadStationMap } from './roadmap';

const container = document.getElementById('map-canvas');
if (container) {
    const root = createRoot(container);
    root.render(<RoadStationMap />);
}
