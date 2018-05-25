var STYLES = {
    0: {icon: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png'},
    1: {icon: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png'},
    2: {icon: 'https://maps.google.com/mapfiles/ms/icons/purple-dot.png'},
    3: {icon: 'https://maps.google.com/mapfiles/ms/icons/yellow-dot.png'},
    4: {icon: 'https://maps.google.com/mapfiles/ms/icons/green-dot.png'},
};


class RoadStationCore {
    constructor(feature, storage) {
        this.feature = feature;
        this.storage = storage;
        this.pref_id = feature.getProperty("pref_id");
        this.station_id = feature.getProperty("station_id");
        this.old_station_id = feature.getProperty("old_station_id");
        this.name = feature.getProperty("name");
        this.address = feature.getProperty("address");
        this.uri = feature.getProperty("uri");
        this.style_id = this.getStyleId();
    }

    getStyleId() {
        var style_id = this.storage.getItem(this.station_id);
        if (style_id) {
            return parseInt(style_id);
        }

        // fallback from oldkey
        if (this.old_station_id) {
            // key format: station_id
            style_id = this.storage.getItem(this.old_station_id.split("/")[1]);
            if (!style_id) {
                // key format: pref_id/station_id
                style_id = this.storage.getItem(this.old_station_id);
            }
            if (style_id) {
                this.storage.removeItem(this.old_station_id);
                this.storage.removeItem(this.old_station_id.split("/")[1]);
                this.storage.setItem(this.station_id, style_id);
                return parseInt(style_id);
            }
        }

        return 0;
    }

    isVisited() {
        return this.style_id;
    }

    getStyle() {
        return STYLES[this.style_id];
    }

    changeStyle() {
        if (this.style_id >= 4) {
            this.resetStyle();
        } else {
            this.style_id += 1;
            this.storage.setItem(this.station_id, this.style_id);
        }
        return this.getStyle();
    }

    resetStyle() {
        this.style_id = 0;
        this.storage.removeItem(this.station_id);
        return this.getStyle();
    }
}

module.exports = RoadStationCore;
