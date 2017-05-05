var RoadStationCore = require('./core.js');
var QueryStorage = require('../storage/queries.js');


function createRoadStation(queries) {
    var storage = new QueryStorage();
    storage.load_from_queries(queries);
    return function (feature) {
        return new RoadStationCore(feature, storage);
    }
}

module.exports = createRoadStation;
