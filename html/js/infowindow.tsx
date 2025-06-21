import React from 'react';
import { createRoot } from 'react-dom/client';
const { useState, useEffect, useRef } = React;

import { createRoadStation as createQueriesRoadStation } from './roadstation/queries';
import { createRoadStation as createLocalStorageRoadStation } from './roadstation/localstorage';
import queryString from 'query-string';

var queries = queryString.parse(location.search);
var createRoadStation = queries.mode == 'shared' 
    ? createQueriesRoadStation(queries)
    : createLocalStorageRoadStation;

export interface InfoWindowProps {
    element: HTMLElement;
    map: google.maps.Map;
    onClick: (feature: google.maps.Data.Feature) => void;
    onRef?: (methods: InfoWindowMethods) => void;
}

export interface InfoWindowMethods {
    open: (feature: google.maps.Data.Feature) => void;
    close: () => void;
    isOpenedFor: (feature: google.maps.Data.Feature) => boolean;
}

function createHeaderContent(feature: google.maps.Data.Feature): HTMLElement {
    const station = createRoadStation(feature);
    const headerDiv = document.createElement('div');
    const link = document.createElement('a');
    link.href = station.uri;
    link.target = '_blank';
    link.textContent = station.name;
    headerDiv.appendChild(link);
    
    const addressDiv = document.createElement('div');
    addressDiv.textContent = `(${station.address})`;
    headerDiv.appendChild(addressDiv);
    
    return headerDiv;
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
            if (feature) {
                infoWindowRef.current.setOptions({
                    headerContent: createHeaderContent(feature),
                    content: props.element
                });
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
                <div>営業時間：{station.hours}</div>
                <div>マップコード：{station.mapcode}</div>
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