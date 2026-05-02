import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';

export interface InfoWindowProps {
    selectedFeature: google.maps.Data.Feature | null;
    map: google.maps.Map | null;
}

export function InfoWindow(props: InfoWindowProps) {
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
                const feature = props.selectedFeature;
                const name = feature.getProperty('name') as string;
                const uri = feature.getProperty('uri') as string;
                const hours = feature.getProperty('hours') as string;
                const address = feature.getProperty('address') as string;
                const mapcode = feature.getProperty('mapcode') as string;
                contentRootRef.current.render(
                    <div>
                        <div>
                            <a href={uri} target="_blank">{name}</a>
                        </div>
                        <div>営業時間：{hours}</div>
                        <div>住所：{address}</div>
                        <div>マップコード：{mapcode}</div>
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

