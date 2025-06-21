var jQuery = require('jquery');
var React = require('react');
var ReactDOM = require('react-dom');
var { useState, useEffect, useRef }: {
    useState: <T>(initialState: T | (() => T)) => [T, (value: T | ((prev: T) => T)) => void];
    useEffect: (effect: () => void | (() => void), deps?: any[]) => void;
    useRef: <T>(initialValue: T) => { current: T };
} = React;
var queryString = require('query-string');
var Clipboard = require('clipboard');
var QueryStorage = require('./storage/queries.ts');

var queries = queryString.parse(location.search);
if (queries.mode == 'shared') {
    var createQueriesRoadStation = require('./roadstation/queries.js');
    var createRoadStation = createQueriesRoadStation(queries);
} else {
    var createRoadStation = require('./roadstation/localstorage.js');
}


function getURL() {
    var baseuri = window.location.href;
    if (queries.mode == 'shared') {
        return baseuri;
    } else {
        var storage = new QueryStorage();
        storage.load_from_localStorage();

        if (baseuri.indexOf("?") > 0) {
            return window.location.href + "&" + queryString.stringify(storage);
        } else {
            return window.location.href + "?" + queryString.stringify(storage);
        }
    }
}

interface InfoWindowProps {
    element: HTMLElement;
    map: google.maps.Map;
    onClick: (feature: google.maps.Data.Feature) => void;
    onRef?: (methods: InfoWindowMethods) => void;
}

interface InfoWindowMethods {
    open: (feature: google.maps.Data.Feature) => void;
    close: () => void;
    isOpenedFor: (feature: google.maps.Data.Feature) => boolean;
}

var InfoWindow = function(props: InfoWindowProps) {
    const [feature, setFeature] = useState<google.maps.Data.Feature | null>(null);
    const infowindowRef = useRef<google.maps.InfoWindow | null>(null);

    useEffect(() => {
        infowindowRef.current = new google.maps.InfoWindow();
        infowindowRef.current.addListener("closeclick", () => setFeature(null));
        infowindowRef.current.setOptions({pixelOffset: new google.maps.Size(0, -30)});
    }, []);

    useEffect(() => {
        if (infowindowRef.current) {
            infowindowRef.current.setContent(props.element);
            if (feature) {
                infowindowRef.current.open(props.map);
            } else {
                infowindowRef.current.close();
            }
        }
    }, [feature, props.element, props.map]);

    const handleClick = () => {
        if (feature) {
            props.onClick(feature);
        }
    };

    const open = (newFeature: google.maps.Data.Feature) => {
        setFeature(newFeature);
    };

    const close = () => {
        setFeature(null);
    };

    const isOpenedFor = (checkFeature: google.maps.Data.Feature) => {
        return !!(infowindowRef.current && (infowindowRef.current as any).getMap() && feature === checkFeature);
    };

    // Expose methods for external access
    if (props.onRef) {
        props.onRef({ open, close, isOpenedFor });
    }

    if (feature && infowindowRef.current) {
        const geometry = feature.getGeometry();
        if (geometry) {
            infowindowRef.current.setPosition((geometry as any).get());
        }
        var station = createRoadStation(feature);
        return (
            <div>
                <div><a href={station.uri} target="_blank">{station.name}</a></div>
                <div>営業時間：{station.hours}</div>
                <div>({station.address})</div>
                <a href="#" onClick={handleClick}>マーカーの色を変える</a>
            </div>
        );
    } else {
        return <div />;
    }
};

var InfoWindowFactory = function(map: google.maps.Map, onClick: (feature: google.maps.Data.Feature) => void): InfoWindowMethods {
    var element = document.createElement("div");
    var infoWindowMethods = {} as InfoWindowMethods;
    ReactDOM.render(
        <InfoWindow 
            map={map} 
            onClick={onClick} 
            element={element}
            onRef={(methods) => Object.assign(infoWindowMethods, methods)}
        />,
        element
    );
    return infoWindowMethods;
};

var RoadStationMap = createReactClass({
    getInitialState: function() {
        return { data: null };
    },
    componentDidMount: function() {
        this.map = new google.maps.Map(ReactDOM.findDOMNode(this), {
            center: { lat: 35.6896342, lng: 139.6921007 }, // Shinjuku, Tokyo
            zoom: 9
        });
        this.map.controls[google.maps.ControlPosition.TOP_LEFT].push(this.createClipboardButton());
        this.infowindow = InfoWindowFactory(this.map, this.onMarkerStyleModifierClicked);

        jQuery.getJSON('../data/stations.geojson', this.onGeoJSONLoaded);
        navigator.geolocation.getCurrentPosition(this.onCurrentPositionGot)
    },
    render: function() {
        return React.createElement('div', { className: 'map-canvas' });
    },
    createClipboardButton: function() {
        var div = document.createElement('div');
        div.className = 'clipboard'
        div.innerText = 'シェア';

        var clipboard = new Clipboard('.clipboard', {
            text: function (trigger) {
                return getURL();
            }
        });
        clipboard.on('success', this.onClipboardCopied);
        return div
    },
    onClipboardCopied: function(event) {
        var top_controls = this.map.controls[google.maps.ControlPosition.TOP];
        var div = document.createElement('div');
        div.className = 'clipboard-message';
        div.innerText = 'クリップボードにコピーしました。';
        top_controls.push(div);

        setTimeout(function() {
            jQuery(div).fadeOut("normal", function() {
                top_controls.pop();
            });
        },
        3000);
    },
    onGeoJSONLoaded: function(data) {
        this.map.addListener("click", this.onMapClicked);
        this.map.data.addGeoJson(data);
        this.map.data.addListener('click', this.onMarkerClicked);
        this.map.data.addListener('dblclick', this.onMarkerDoubleClicked);
        this.map.data.setStyle(function(feature) {
            return createRoadStation(feature).getStyle();
        });
    },
    onCurrentPositionGot: function(pos) {
        var latlng = new google.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
        this.map.setCenter(latlng);
    },
    onMapClicked: function() {
        this.infowindow.current.close();
    },
    onMarkerStyleModifierClicked: function(feature) {
        var station = createRoadStation(feature);
        this.map.data.overrideStyle(feature, station.changeStyle());
        this.infowindow.current.close();
    },
    onMarkerClicked: function(event) {
        if (this.infowindow.current && this.infowindow.current.isOpenedFor(event.feature)) {
            var station = createRoadStation(event.feature);
            this.map.data.overrideStyle(event.feature, station.changeStyle());
        } else {
            this.infowindow.current.open(event.feature)
        }
    },
    onMarkerDoubleClicked: function(event) {
        var station = createRoadStation(event.feature);
        this.map.data.overrideStyle(event.feature, station.changeStyle());
        this.infowindow.current.close();
    }
});

module.exports = RoadStationMap;
