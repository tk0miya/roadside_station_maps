import { RoadStationCore } from './core.ts';
import { QueryStorage } from '../storage/queries.ts';

interface Queries {
    c1?: string;
    c2?: string;
    c3?: string;
    c4?: string;
    mode?: string;
}

export function createRoadStation(queries: Queries) {
    var storage = new QueryStorage();
    storage.load_from_queries(queries);
    return function (feature: google.maps.Data.Feature) {
        return new RoadStationCore(feature, storage);
    }
}

