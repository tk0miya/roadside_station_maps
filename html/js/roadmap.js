// RoadStation class
var RoadStation = (function() {
    var STYLES = {
        0: {icon: 'http://maps.google.com/mapfiles/ms/icons/red-dot.png'},
        1: {icon: 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png'},
        2: {icon: 'http://maps.google.com/mapfiles/ms/icons/purple-dot.png'},
        3: {icon: 'http://maps.google.com/mapfiles/ms/icons/yellow-dot.png'},
        4: {icon: 'http://maps.google.com/mapfiles/ms/icons/green-dot.png'},
    };

    var station = function(feature) {
        this.feature = feature;
        this.pref_id = feature.getProperty("pref_id");
        this.station_id = feature.getProperty("station_id");
        this.name = feature.getProperty("name");
        this.address = feature.getProperty("address");
        this.style_id = this.getStyleId();
    };

    var proto = station.prototype;

    proto.getStyleId = function() {
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
    };

    proto.isVisited = function() {
        return this.style_id;
    };

    proto.getStyle = function() {
        return STYLES[this.style_id];
    };

    proto.changeStyle = function() {
        if (this.style_id >= 4) {
            this.resetStyle();
        } else {
            this.style_id += 1;
            localStorage.setItem(this.station_id, this.style_id);
        }
        return this.getStyle();
    }

    proto.resetStyle = function() {
        this.style_id = 0;
        localStorage.removeItem(this.station_id);
        return this.getStyle();
    };

    return station;
})();

google.maps.event.addDomListener(window, 'load', function() {
    var map = new google.maps.Map(document.getElementById('map-canvas'), {
        center: { lat: 35.6896342, lng: 139.6921007 }, // Shinjuku, Tokyo
        zoom: 9
    });

    var infowindow = new google.maps.InfoWindow();

    google.maps.event.addListener(map, "click", function(){
        infowindow.close();
    });

    d3.json('../data/stations.geojson', function(data) {
        map.data.addGeoJson(data);
        map.data.setStyle(function(feature) {
            return new RoadStation(feature).getStyle();
        });
        map.data.addListener('click', onClickMarker);
        map.data.addListener('dblclick', onDoubleClickMarker);
    });

    var onClickMarker = function(event) {
        var station = new RoadStation(event.feature);
        if (infowindow.getMap() && infowindow.feature == station.feature) {
            map.data.overrideStyle(event.feature, station.changeStyle());
        } else {
            infowindow.content.children[0].innerText = station.name;
            infowindow.content.children[1].innerText = "(" + event.address + ")";
            infowindow.setPosition(station.feature.getGeometry().get());
            infowindow.feature = station.feature;
            infowindow.open(map);
        }
    }

    var onDoubleClickMarker = function(event) {
        var station = new RoadStation(event.feature);
        map.data.overrideStyle(event.feature, station.changeStyle());
        infowindow.close();
    }

    // initialize infowindow
    var initialize_infowindow = function() {
        // pre setup DOM and event listener
        var switcher = $('<a />').attr('href', '#')
        switcher[0].innerText = 'マーカーの色を変える';
        switcher.on('click', function() {
            var station = new RoadStation(infowindow.feature);
            map.data.overrideStyle(infowindow.feature, station.changeStyle());
            infowindow.close();
        });

        var root = document.createElement("div");
        $('<div/>').appendTo(root);
        $('<div/>').appendTo(root);
        $('<div/>').append(switcher).appendTo(root);

        infowindow.setContent(root);
        infowindow.setOptions({pixelOffset: new google.maps.Size(0, -30)});
    };
    initialize_infowindow();
});
