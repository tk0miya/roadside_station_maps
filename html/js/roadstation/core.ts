interface Style {
    icon: string;
}

const STYLES: Record<number, Style> = {
    0: {icon: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png'},
    1: {icon: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png'},
    2: {icon: 'https://maps.google.com/mapfiles/ms/icons/purple-dot.png'},
    3: {icon: 'https://maps.google.com/mapfiles/ms/icons/yellow-dot.png'},
    4: {icon: 'https://maps.google.com/mapfiles/ms/icons/green-dot.png'},
};


interface Storage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

class RoadStationCore {
    feature: google.maps.Data.Feature;
    storage: Storage;
    pref_id: string;
    station_id: string;
    old_station_id: string | null;
    name: string;
    address: string;
    hours: string;
    uri: string;
    style_id: number;

    constructor(feature: google.maps.Data.Feature, storage: Storage) {
        this.feature = feature;
        this.storage = storage;
        this.pref_id = feature.getProperty("pref_id") as string;
        this.station_id = feature.getProperty("station_id") as string;
        this.old_station_id = feature.getProperty("old_station_id") as string | null;
        this.name = feature.getProperty("name") as string;
        this.address = feature.getProperty("address") as string;
        this.hours = feature.getProperty("hours") as string;
        this.uri = feature.getProperty("uri") as string;
        this.style_id = this.getStyleId();
    }

    getStyleId(): number {
        const style_id = this.storage.getItem(this.station_id);
        if (style_id) {
            return parseInt(style_id);
        }

        // fallback from oldkey
        if (this.old_station_id) {
            // key format: station_id
            let fallback_style_id = this.storage.getItem(this.old_station_id.split("/")[1]);
            if (!fallback_style_id) {
                // key format: pref_id/station_id
                fallback_style_id = this.storage.getItem(this.old_station_id);
            }
            if (fallback_style_id) {
                this.storage.removeItem(this.old_station_id);
                this.storage.removeItem(this.old_station_id.split("/")[1]);
                this.storage.setItem(this.station_id, fallback_style_id);
                return parseInt(fallback_style_id);
            }
        }

        return 0;
    }

    isVisited(): boolean {
        return !!this.style_id;
    }

    getStyle(): Style {
        return STYLES[this.style_id];
    }

    changeStyle(): Style {
        if (this.style_id >= 4) {
            this.resetStyle();
        } else {
            this.style_id += 1;
            this.storage.setItem(this.station_id, this.style_id.toString());
        }
        return this.getStyle();
    }

    resetStyle(): Style {
        this.style_id = 0;
        this.storage.removeItem(this.station_id);
        return this.getStyle();
    }
}

module.exports = RoadStationCore;

// Export to make this file a module and avoid global scope conflicts
export {};
