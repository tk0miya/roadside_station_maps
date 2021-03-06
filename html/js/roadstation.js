var STYLES = {
    0: {icon: 'http://maps.google.com/mapfiles/ms/icons/red-dot.png'},
    1: {icon: 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png'},
    2: {icon: 'http://maps.google.com/mapfiles/ms/icons/purple-dot.png'},
    3: {icon: 'http://maps.google.com/mapfiles/ms/icons/yellow-dot.png'},
    4: {icon: 'http://maps.google.com/mapfiles/ms/icons/green-dot.png'},
};

class RoadStation {
    constructor(feature) {
        this.feature = feature;
        this.pref_id = feature.getProperty("pref_id");
        this.station_id = feature.getProperty("station_id");
        this.name = feature.getProperty("name");
        this.address = feature.getProperty("address");
        this.style_id = this.getStyleId();
    }

    getStyleId() {
        var style_id = localStorage.getItem(this.station_id);
        if (style_id) {
            return parseInt(style_id);
        }

        // fallback from oldkey
        var key = this.pref_id + "/" + this.station_id;
        style_id = localStorage.getItem(key);
        if (style_id) {
            localStorage.removeItem(key);
            localStorage.setItem(key, 1);
            return parseInt(style_id);
        } else {
            return 0;
        }
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
            localStorage.setItem(this.station_id, this.style_id);
        }
        return this.getStyle();
    }

    resetStyle() {
        this.style_id = 0;
        localStorage.removeItem(this.station_id);
        return this.getStyle();
    }
}

module.exports = RoadStation;
