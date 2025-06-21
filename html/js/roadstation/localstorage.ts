// @ts-ignore
const RoadStationCore = require('./core.ts')

function createRoadStation(feature: google.maps.Data.Feature) {
    return new RoadStationCore(feature, localStorage);
}

module.exports = createRoadStation;
