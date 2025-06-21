var RoadStationCore = require('./core.js')


function createRoadStation(feature) {
    return new RoadStationCore(feature, localStorage);
}

module.exports = createRoadStation;
