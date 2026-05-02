import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';

import { createRoadStation, RoadStation } from '../road-station';
import { STYLES, StyleManager } from '../style-manager';

export interface InfoWindowProps {
    selectedFeature: google.maps.Data.Feature | null;
    map: google.maps.Map | null;
    styleManager: StyleManager;
    onStyleChange: () => void;
}

interface ColorPickerProps {
    station: RoadStation;
    currentStyleId: number;
    onSelect: (styleId: number) => void;
}

function ColorPicker(props: ColorPickerProps) {
    const styleIds = Object.keys(STYLES).map(Number).sort((a, b) => a - b);
    return (
        <div className="color-picker">
            {styleIds.map((styleId) => {
                const isCurrent = styleId === props.currentStyleId;
                return (
                    <button
                        key={styleId}
                        type="button"
                        className={`color-picker-button${isCurrent ? ' selected' : ''}`}
                        aria-label={`color-${styleId}`}
                        aria-pressed={isCurrent}
                        onClick={() => props.onSelect(styleId)}
                    >
                        <img src={STYLES[styleId].icon as string} alt="" />
                    </button>
                );
            })}
        </div>
    );
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
        if (!infoWindowRef.current || !contentElementRef.current || !contentRootRef.current) {
            return;
        }

        if (!props.selectedFeature) {
            infoWindowRef.current.close();
            return;
        }

        const feature = props.selectedFeature;
        const station = createRoadStation(feature);
        const currentStyleId = props.styleManager.getCurrentStyleId(station);

        const handleSelect = (styleId: number) => {
            const newStyle = props.styleManager.setStyle(station, styleId);
            if (props.map) {
                props.map.data.overrideStyle(feature, newStyle);
            }
            props.onStyleChange();
        };

        contentRootRef.current.render(
            <div>
                <div>
                    <a href={station.uri} target="_blank">{station.name}</a>
                </div>
                <div>営業時間：{station.hours}</div>
                <div>住所：{station.address}</div>
                <div>マップコード：{station.mapcode}</div>
                <ColorPicker
                    station={station}
                    currentStyleId={currentStyleId}
                    onSelect={handleSelect}
                />
            </div>
        );

        const geometry = feature.getGeometry()! as google.maps.Data.Point;
        infoWindowRef.current.setOptions({
            position: geometry.get(),
            content: contentElementRef.current,
            headerDisabled: true,
            pixelOffset: new google.maps.Size(0, -30)
        });
        infoWindowRef.current.open(props.map);
    }, [props.selectedFeature, props.map, props.styleManager, props.onStyleChange]);

    return null;
};
