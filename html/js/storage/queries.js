

function encode(array) {
    return btoa(String.fromCharCode.apply(null, array));
}


function decode(buf) {
    if (buf) {
        try {
            return new Uint8Array(atob(buf).split("").map(function(c) {
                return c.charCodeAt(0);
            }));
        } catch (e) {
            console.log(e);
        }
    }
    return new Uint8Array();
}


class QueryStorage {
    constructor() {
        this.mode = 'shared';
        this.c1 = new Uint8Array();
        this.c2 = new Uint8Array();
        this.c3 = new Uint8Array();
        this.c4 = new Uint8Array();
    }

    load_from_localStorage() {
        var self = this;
        var styles = {"1": [], "2": [], "3": [], "4": []};
        Object.keys(localStorage).forEach(function(station_id){
            var style_id = localStorage.getItem(station_id);
            console.log([station_id, style_id]);
            styles[style_id].push(parseInt(station_id));
        });

        var params = {};
        Object.keys(styles).forEach(function(style_id){
            var station_ids = styles[style_id];
            if (station_ids.length > 0) {
                var max_style_id = Math.max.apply(null, station_ids);
                var size = Math.ceil(max_style_id / 8);
                var buf = new Uint8Array(size);

                station_ids.forEach(function(station_id){
                    var idx = Math.floor(station_id / 8);
                    var shift = station_id % 8;
                    buf[idx] |= 1 << shift;
                });
                console.log(style_id);
                console.log(buf);
                self["c" + style_id] = encode(buf);
            }
        });
    }

    load_from_queries(queries) {
        this.c1 = decode(queries.c1);
        this.c2 = decode(queries.c2);
        this.c3 = decode(queries.c3);
        this.c4 = decode(queries.c4);
        console.log(this.c1);
        console.log(this.c4);
    }

    getItem(key) {
        var id = parseInt(key);
        var idx = Math.floor(id / 8);
        var shift = id % 8;

        if (this.c1[idx] & 1 << shift) {
            return 1;
        }
        if (this.c2[idx] & 1 << shift) {
            return 2;
        }
        if (this.c3[idx] & 1 << shift) {
            return 3;
        }
        if (this.c4[idx] & 1 << shift) {
            return 4;
        }
        return 0;
    }

    setItem(key, value) {
        // skip
    }

    removeItem(key) {
        // skip
    }
}


module.exports = QueryStorage;
