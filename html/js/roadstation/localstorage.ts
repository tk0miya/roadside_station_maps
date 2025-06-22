import { RoadStation } from './core';

export function createRoadStation(feature: google.maps.Data.Feature) {
    return new RoadStation(feature, localStorage);
}

