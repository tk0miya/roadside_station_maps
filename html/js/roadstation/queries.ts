import { RoadStationCore } from './core.ts';
import { QueryStorage } from '../storage/queries.ts';

export function createRoadStation(queries: any) {
    var storage = new QueryStorage();
    storage.load_from_queries(queries);
    return function (feature: google.maps.Data.Feature) {
        return new RoadStationCore(feature, storage);
    }
}

