var RoadStation = require('./roadstation');

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
        map.data.addListener('click', onMarkerClicked);
        map.data.addListener('dblclick', onMarkerDoubleClicked);
    });

    var onMarkerClicked = function(event) {
        var station = new RoadStation(event.feature);
        if (infowindow.getMap() && infowindow.feature == station.feature) {
            map.data.overrideStyle(event.feature, station.changeStyle());
        } else {
            infowindow.content.children[0].innerText = station.name;
            infowindow.content.children[1].innerText = "(" + station.address + ")";
            infowindow.setPosition(station.feature.getGeometry().get());
            infowindow.feature = station.feature;
            infowindow.open(map);
        }
    }

    var onMarkerDoubleClicked = function(event) {
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
