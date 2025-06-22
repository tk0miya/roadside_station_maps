import { createRoot } from 'react-dom/client';
import { RoadStationMap } from './components/RoadStationMap';

const container = document.getElementById('map-canvas');
if (container) {
    const root = createRoot(container);
    root.render(<RoadStationMap />);
}
