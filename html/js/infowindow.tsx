import React from 'react';
import { createRoot } from 'react-dom/client';
const { useState, useEffect, useRef } = React;

import { createRoadStation as createQueriesRoadStation } from './roadstation/queries';
import { createRoadStation as createLocalStorageRoadStation } from './roadstation/localstorage';
import { RoadStationCore } from './roadstation/core';
import queryString from 'query-string';

var queries = queryString.parse(location.search);
var createRoadStation = queries.mode == 'shared' 
    ? createQueriesRoadStation(queries)
    : createLocalStorageRoadStation;

export interface InfoWindowProps {
    feature: google.maps.Data.Feature | null;
    map: google.maps.Map;
    onClose: () => void;
    onClick: (feature: google.maps.Data.Feature) => void;
}


function createHeaderContent(station: RoadStationCore): HTMLElement {
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
    const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
    const contentElementRef = useRef<HTMLElement | null>(null);
    const contentRootRef = useRef<any>(null);

    useEffect(() => {
        infoWindowRef.current = new google.maps.InfoWindow();
        infoWindowRef.current.addListener("closeclick", props.onClose);
        
        contentElementRef.current = document.createElement('div');
        contentRootRef.current = createRoot(contentElementRef.current);
    }, []);

    useEffect(() => {
        if (infoWindowRef.current && contentElementRef.current && contentRootRef.current) {
            if (props.feature) {
                // Update content
                const station = createRoadStation(props.feature);
                contentRootRef.current.render(
                    <div>
                        <div>営業時間：{station.hours}</div>
                        <div>マップコード：{station.mapcode}</div>
                        <a href="#" onClick={() => props.onClick(props.feature!)}>マーカーの色を変える</a>
                    </div>
                );
                
                const geometry = props.feature.getGeometry()! as google.maps.Data.Point;
                infoWindowRef.current.setOptions({
                    position: geometry.get(),
                    headerContent: createHeaderContent(station),
                    content: contentElementRef.current,
                    pixelOffset: new google.maps.Size(0, -30)
                });
                infoWindowRef.current.open(props.map);
            } else {
                infoWindowRef.current.close();
            }
        }
    }, [props.feature, props.map]);

    return null; // This component doesn't render anything directly
};

