import jQuery from 'jquery';
import React from 'react';
import { createRoot } from 'react-dom/client';
const { useState, useEffect, useRef } = React;
import queryString from 'query-string';
import Clipboard from 'clipboard';
import { QueryStorage } from './storage/queries';

import { createRoadStation as createQueriesRoadStation } from './roadstation/queries';
import { createRoadStation as createLocalStorageRoadStation } from './roadstation/localstorage';

var queries = queryString.parse(location.search);
var createRoadStation = queries.mode == 'shared' 
    ? createQueriesRoadStation(queries)
    : createLocalStorageRoadStation;


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

export var InfoWindow = function(props: InfoWindowProps) {
    const [feature, setFeature] = useState<google.maps.Data.Feature | null>(null);
    const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

    useEffect(() => {
        infoWindowRef.current = new google.maps.InfoWindow();
        infoWindowRef.current.addListener("closeclick", () => setFeature(null));
        infoWindowRef.current.setOptions({pixelOffset: new google.maps.Size(0, -30)});
    }, []);

    useEffect(() => {
        if (infoWindowRef.current) {
            infoWindowRef.current.setContent(props.element);
            if (feature) {
                infoWindowRef.current.open(props.map);
            } else {
                infoWindowRef.current.close();
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
        return !!(infoWindowRef.current && (infoWindowRef.current as any).getMap() && feature === checkFeature);
    };

    // Expose methods for external access
    if (props.onRef) {
        props.onRef({ open, close, isOpenedFor });
    }

    if (feature && infoWindowRef.current) {
        const geometry = feature.getGeometry();
        if (geometry) {
            infoWindowRef.current.setPosition((geometry as any).get());
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

export var InfoWindowFactory = function(map: google.maps.Map, onClick: (feature: google.maps.Data.Feature) => void): InfoWindowMethods {
    var element = document.createElement("div");
    var infoWindowMethods = {} as InfoWindowMethods;
    const root = createRoot(element);
    root.render(
        <InfoWindow 
            map={map} 
            onClick={onClick} 
            element={element}
            onRef={(methods) => Object.assign(infoWindowMethods, methods)}
        />
    );
    return infoWindowMethods;
};

export var RoadStationMap = function() {
    const mapContainerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<google.maps.Map | null>(null);
    const infoWindowRef = useRef<InfoWindowMethods | null>(null);

    useEffect(() => {
        if (mapContainerRef.current) {
            mapRef.current = new google.maps.Map(mapContainerRef.current, {
                center: { lat: 35.6896342, lng: 139.6921007 }, // Shinjuku, Tokyo
                zoom: 9
            });
            mapRef.current.controls[google.maps.ControlPosition.TOP_LEFT].push(createClipboardButton());
            infoWindowRef.current = InfoWindowFactory(mapRef.current, onMarkerStyleModifierClicked);

            jQuery.getJSON('../data/stations.geojson', onGeoJSONLoaded);
            navigator.geolocation.getCurrentPosition(onCurrentPositionGot);
        }
    }, []);

    const createClipboardButton = () => {
        var div = document.createElement('div');
        div.className = 'clipboard'
        div.innerText = 'シェア';

        var clipboard = new Clipboard('.clipboard', {
            text: function (_trigger: Element) {
                return getURL();
            }
        });
        clipboard.on('success', onClipboardCopied);
        return div;
    };

    const onClipboardCopied = (_event: ClipboardJS.Event) => {
        if (mapRef.current) {
            var top_controls = mapRef.current.controls[(google.maps.ControlPosition as any).TOP];
            var div = document.createElement('div');
            div.className = 'clipboard-message';
            div.innerText = 'クリップボードにコピーしました。';
            top_controls.push(div);

            setTimeout(function() {
                jQuery(div).fadeOut("normal", function() {
                    top_controls.pop();
                });
            }, 3000);
        }
    };

    const onGeoJSONLoaded = (data: object) => {
        if (mapRef.current) {
            mapRef.current.addListener("click", onMapClicked);
            mapRef.current.data.addGeoJson(data);
            mapRef.current.data.addListener('click', onMarkerClicked);
            mapRef.current.data.addListener('dblclick', onMarkerDoubleClicked);
            mapRef.current.data.setStyle(function(feature: google.maps.Data.Feature) {
                return createRoadStation(feature).getStyle();
            });
        }
    };
    const onCurrentPositionGot = (pos: GeolocationPosition) => {
        if (mapRef.current) {
            var latlng = new google.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
            mapRef.current.setCenter(latlng);
        }
    };
    const onMapClicked = () => {
        if (infoWindowRef.current) {
            infoWindowRef.current.close();
        }
    };
    const onMarkerStyleModifierClicked = (feature: google.maps.Data.Feature) => {
        if (mapRef.current && infoWindowRef.current) {
            var station = createRoadStation(feature);
            mapRef.current.data.overrideStyle(feature, station.changeStyle());
            infoWindowRef.current.close();
        }
    };
    const onMarkerClicked = (event: google.maps.Data.MouseEvent) => {
        if (mapRef.current && infoWindowRef.current && infoWindowRef.current.isOpenedFor(event.feature)) {
            var station = createRoadStation(event.feature);
            mapRef.current.data.overrideStyle(event.feature, station.changeStyle());
        } else if (infoWindowRef.current) {
            infoWindowRef.current.open(event.feature);
        }
    };

    const onMarkerDoubleClicked = (event: google.maps.Data.MouseEvent) => {
        if (mapRef.current && infoWindowRef.current) {
            var station = createRoadStation(event.feature);
            mapRef.current.data.overrideStyle(event.feature, station.changeStyle());
            infoWindowRef.current.close();
        }
    };

    return <div ref={mapContainerRef} className="map-canvas" />;
};

