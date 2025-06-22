import { describe, it, expect } from 'vitest';
import { createRoadStation } from './road-station';

// Mock google.maps.Data.Feature
const createMockFeature = (properties: Record<string, unknown>): google.maps.Data.Feature => {
    return {
        getProperty: (name: string) => properties[name],
    } as unknown as google.maps.Data.Feature;
};

describe('road-station.ts', () => {
    describe('createRoadStation', () => {
        it('should create RoadStation from feature with all properties', () => {
            const mockProperties = {
                prefId: '01',
                stationId: 'station001',
                name: 'Test Station',
                address: '123 Test Street',
                hours: '9:00-17:00',
                uri: 'https://example.com/station001',
                mapcode: '123 456*78',
            };

            const mockFeature = createMockFeature(mockProperties);
            const roadStation = createRoadStation(mockFeature);

            expect(roadStation).toEqual({
                prefId: '01',
                stationId: 'station001',
                name: 'Test Station',
                address: '123 Test Street',
                hours: '9:00-17:00',
                uri: 'https://example.com/station001',
                mapcode: '123 456*78',
            });
        });

        it('should handle missing or null properties', () => {
            const mockProperties = {
                prefId: '01',
                stationId: 'station001',
                name: null,
                // address is missing (undefined)
                hours: '',
                uri: 'https://example.com/station001',
                mapcode: null,
            };

            const mockFeature = createMockFeature(mockProperties);
            const roadStation = createRoadStation(mockFeature);

            expect(roadStation).toEqual({
                prefId: '01',
                stationId: 'station001',
                name: null,
                address: undefined,
                hours: '',
                uri: 'https://example.com/station001',
                mapcode: null,
            });
        });
    });
});