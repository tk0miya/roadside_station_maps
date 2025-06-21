import React from 'react';
const { useEffect, useRef } = React;
import queryString from 'query-string';
import Clipboard from 'clipboard';
import { QueryStorage } from './storage/queries';
import { InfoWindowFactory, InfoWindowMethods } from './infowindow';

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


// Utility function to fade out an element
async function fadeOut(element: HTMLElement, delay: number): Promise<void> {
    // Set up transition
    element.style.transition = 'opacity 0.4s ease-out';
    element.style.opacity = '1';
    
    // Wait for the delay
    await new Promise(resolve => setTimeout(resolve, delay));
    
    // Start fade out
    element.style.opacity = '0';
    
    // Wait for transition to complete
    await new Promise<void>(resolve => {
        element.addEventListener('transitionend', () => resolve(), { once: true });
    });
}

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

            fetch('../data/stations.geojson')
                .then(response => response.json())
                .then(onGeoJSONLoaded)
                .catch(error => console.error('Error loading GeoJSON:', error));
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

    const onClipboardCopied = async () => {
        if (mapRef.current) {
            const topControls = mapRef.current.controls[(google.maps.ControlPosition as any).TOP];
            const div = document.createElement('div');
            div.className = 'clipboard-message';
            div.innerText = 'クリップボードにコピーしました。';
            
            topControls.push(div);
            
            // Fade out after 3 seconds
            await fadeOut(div, 3000);
            topControls.pop();
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

