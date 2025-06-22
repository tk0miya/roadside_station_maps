import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';

import { createRoadStation as createQueriesRoadStation } from '../roadstation/queries';
import { createRoadStation as createLocalStorageRoadStation } from '../roadstation/localstorage';
import queryString from 'query-string';

var queries = queryString.parse(location.search);
var createRoadStation = queries.mode == 'shared'
    ? createQueriesRoadStation(queries)
    : createLocalStorageRoadStation;

export interface InfoWindowProps {
    selectedFeature: google.maps.Data.Feature | null;
    map: google.maps.Map | null;
}

export var InfoWindow = function(props: InfoWindowProps) {
    const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
    const contentElementRef = useRef<HTMLElement | null>(null);
    const contentRootRef = useRef<any>(null);

    useEffect(() => {
        infoWindowRef.current = new google.maps.InfoWindow();

        contentElementRef.current = document.createElement('div');
        contentRootRef.current = createRoot(contentElementRef.current);
    }, []);

    useEffect(() => {
        if (infoWindowRef.current && contentElementRef.current && contentRootRef.current) {
            if (props.selectedFeature) {
                // Update content
                const station = createRoadStation(props.selectedFeature);
                contentRootRef.current.render(
                    <div>
                        <div>
                            <a href={station.uri} target="_blank">{station.name}</a>
                        </div>
                        <div>営業時間：{station.hours}</div>
                        <div>住所：{station.address}</div>
                        <div>マップコード：{station.mapcode}</div>
                    </div>
                );

                const geometry = props.selectedFeature.getGeometry()! as google.maps.Data.Point;
                infoWindowRef.current.setOptions({
                    position: geometry.get(),
                    content: contentElementRef.current,
                    headerDisabled: true,
                    pixelOffset: new google.maps.Size(0, -30)
                });
                infoWindowRef.current.open(props.map);
            } else {
                infoWindowRef.current.close();
            }
        }
    }, [props.selectedFeature, props.map]);

    return null; // This component doesn't render anything directly
};

