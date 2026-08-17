export interface Station {
    prefId: string;
    prefName: string;
    stationId: string;
    name: string;
    address: string;
    tel: string;
    hours: string;
    uri: string;
    // null when the station page carried no parsable Google Maps link.
    lat: number | null;
    lng: number | null;
    mapcode: string;
}
