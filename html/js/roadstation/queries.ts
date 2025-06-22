import { RoadStationCore } from './core';
import { QueryStorage } from '../storage/queries';

interface Queries {
    c1?: string;
    c2?: string;
    c3?: string;
    c4?: string;
    mode?: string;
}

export function createRoadStation(queries: Queries) {
    const storage = new QueryStorage();
    storage.load_from_queries(queries);
    return function (feature: google.maps.Data.Feature) {
        return new RoadStationCore(feature, storage);
    }
}

