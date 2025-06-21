import { RoadStationCore } from './core';

export function createRoadStation(feature: google.maps.Data.Feature) {
    return new RoadStationCore(feature, localStorage);
}

