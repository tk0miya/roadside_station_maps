export interface RoadStation {
    readonly stationId: string;
    readonly name: string;
    readonly address: string;
    readonly hours: string;
    readonly uri: string;
    readonly mapcode: string;
    readonly prefId: string;
}

export function createRoadStation(feature: google.maps.Data.Feature): RoadStation {
    return {
        prefId: feature.getProperty("prefId") as string,
        stationId: feature.getProperty("stationId") as string,
        name: feature.getProperty("name") as string,
        address: feature.getProperty("address") as string,
        hours: feature.getProperty("hours") as string,
        uri: feature.getProperty("uri") as string,
        mapcode: feature.getProperty("mapcode") as string,
    };
}