export interface RoadStation {
    readonly station_id: string;
    readonly name: string;
    readonly address: string;
    readonly hours: string;
    readonly uri: string;
    readonly mapcode: string;
    readonly pref_id: string;
}

export function createRoadStation(feature: google.maps.Data.Feature): RoadStation {
    return {
        pref_id: feature.getProperty("pref_id") as string,
        station_id: feature.getProperty("station_id") as string,
        name: feature.getProperty("name") as string,
        address: feature.getProperty("address") as string,
        hours: feature.getProperty("hours") as string,
        uri: feature.getProperty("uri") as string,
        mapcode: feature.getProperty("mapcode") as string,
    };
}