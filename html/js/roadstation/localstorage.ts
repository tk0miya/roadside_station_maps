import { RoadStationCore } from './core.ts';

export function createRoadStation(feature: google.maps.Data.Feature) {
    return new RoadStationCore(feature, localStorage);
}

