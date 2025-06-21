interface Style {
    icon: string;
}

const STYLES: Record<number, Style> = {
    0: { icon: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png' },
    1: { icon: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png' },
    2: { icon: 'https://maps.google.com/mapfiles/ms/icons/purple-dot.png' },
    3: { icon: 'https://maps.google.com/mapfiles/ms/icons/yellow-dot.png' },
    4: { icon: 'https://maps.google.com/mapfiles/ms/icons/green-dot.png' },
};


interface Storage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

export class RoadStationCore {
    feature: google.maps.Data.Feature;
    storage: Storage;
    pref_id: string;
    station_id: string;
    name: string;
    address: string;
    hours: string;
    uri: string;
    mapcode: string;
    style_id: number;

    constructor(feature: google.maps.Data.Feature, storage: Storage) {
        this.feature = feature;
        this.storage = storage;
        this.pref_id = feature.getProperty("pref_id") as string;
        this.station_id = feature.getProperty("station_id") as string;
        this.name = feature.getProperty("name") as string;
        this.address = feature.getProperty("address") as string;
        this.hours = feature.getProperty("hours") as string;
        this.uri = feature.getProperty("uri") as string;
        this.mapcode = feature.getProperty("mapcode") as string;
        this.style_id = this.getStyleId();
    }

    getStyleId(): number {
        const style_id = this.storage.getItem(this.station_id);
        if (style_id) {
            return parseInt(style_id);
        }
        return 0;
    }

    getStyle(): Style {
        return STYLES[this.style_id];
    }

    changeStyle(): Style {
        if (this.style_id >= 4) {
            this.style_id = 0;
        } else {
            this.style_id += 1;
        }
        this.storage.setItem(this.station_id, this.style_id.toString());
        return this.getStyle();
    }
}

