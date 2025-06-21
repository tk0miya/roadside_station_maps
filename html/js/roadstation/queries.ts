// @ts-ignore
var RoadStationCore = require('./core.ts');
// @ts-ignore
var QueryStorage = require('../storage/queries.ts');


function createRoadStation(queries: any) {
    var storage = new QueryStorage();
    storage.load_from_queries(queries);
    return function (feature: google.maps.Data.Feature) {
        return new RoadStationCore(feature, storage);
    }
}

module.exports = createRoadStation;

// Export to make this file a module and avoid global scope conflicts
export {};
