/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { StationStyleSerializer } from './station-style-serializer';
import { createMockStations } from '../../test-utils/test-utils';
import { QueryStorage } from './query-storage';

// Create default mock stations for most tests
const mockStations = createMockStations(3);

describe('StationStyleSerializer', () => {
  describe('serialize', () => {
    it('should return empty strings for empty storage', () => {
      const queryStorage = new QueryStorage();

      const queries = StationStyleSerializer.serialize(queryStorage, mockStations);

      expect(queries.c1).toBe('');
      expect(queries.c2).toBe('');
      expect(queries.c3).toBe('');
      expect(queries.c4).toBe('');
    });

    it('should encode multiple stations with different styles', () => {
      const queryStorage = new QueryStorage();
      queryStorage.setItem('18786', '1'); // internalId 0
      queryStorage.setItem('18787', '2'); // internalId 1
      queryStorage.setItem('18788', '4'); // internalId 2

      const queries = StationStyleSerializer.serialize(queryStorage, mockStations);

      // c1: bit 0 set: [1] -> "AQ" (URL-safe, no padding)
      expect(queries.c1).toBe('AQ');
      // c2: bit 1 set: [2] -> "Ag" (URL-safe, no padding)
      expect(queries.c2).toBe('Ag');
      expect(queries.c3).toBe('');
      // c4: bit 2 set: [4] -> "BA" (URL-safe, no padding)
      expect(queries.c4).toBe('BA');
    });

    it('should handle multiple stations with same style', () => {
      const testStations = createMockStations(4);
      const queryStorage = new QueryStorage();

      queryStorage.setItem('18786', '1'); // internalId 0
      queryStorage.setItem('18787', '1'); // internalId 1
      queryStorage.setItem('18788', '1'); // internalId 2

      const queries = StationStyleSerializer.serialize(queryStorage, testStations);

      // c1: bits 0,1,2 set: [7] -> "Bw" (URL-safe, no padding)
      expect(queries.c1).toBe('Bw');
      expect(queries.c2).toBe('');
      expect(queries.c3).toBe('');
      expect(queries.c4).toBe('');
    });

    it('should handle sparse data in large dataset', () => {
      const testStations = createMockStations(100);
      const queryStorage = new QueryStorage();

      // Set styles for stations at various positions to test sparse bitmap
      queryStorage.setItem('18795', '1');  // index 9
      queryStorage.setItem('18810', '2');  // index 24
      queryStorage.setItem('18835', '3');  // index 49
      queryStorage.setItem('18860', '4');  // index 74
      queryStorage.setItem('18885', '1');  // index 99

      const queries = StationStyleSerializer.serialize(queryStorage, testStations);

      // c1: bits 9 and 99 set
      expect(queries.c1).toBe('AAIAAAAAAAAAAAAACA');

      // c2: bit 24 set
      expect(queries.c2).toBe('AAAAAQ');

      // c3: bit 49 set
      expect(queries.c3).toBe('AAAAAAAAAg');

      // c4: bit 74 set
      expect(queries.c4).toBe('AAAAAAAAAAAABA');
    });

    it('should skip stations not in the stations data', () => {
      const queryStorage = new QueryStorage();
      queryStorage.setItem('18786', '1'); // exists in mockStations
      queryStorage.setItem('99999', '2'); // does not exist in mockStations

      const queries = StationStyleSerializer.serialize(queryStorage, mockStations);

      expect(queries.c1).toBe('AQ'); // Only 18786 should be encoded
      expect(queries.c2).toBe(''); // 99999 should be skipped
      expect(queries.c3).toBe('');
      expect(queries.c4).toBe('');
    });
  });

  describe('deserialize', () => {
    it('should handle empty queries', () => {
      const queryStorage = new QueryStorage({});
      
      StationStyleSerializer.deserialize(queryStorage, mockStations);
      
      expect(queryStorage.listItems()).toEqual([]);
    });

    it('should restore station styles from queries', () => {
      const queryStorage = new QueryStorage({
        c1: 'AQ==', // Base64 for [1] - represents internalId 0
        c2: 'Ag==', // Base64 for [2] - represents internalId 1
        c4: 'BA==', // Base64 for [4] - represents internalId 2
      });
      
      StationStyleSerializer.deserialize(queryStorage, mockStations);
      
      expect(queryStorage.getItem('18786')).toBe('1'); // internalId 0 -> stationId 18786
      expect(queryStorage.getItem('18787')).toBe('2'); // internalId 1 -> stationId 18787
      expect(queryStorage.getItem('18788')).toBe('4'); // internalId 2 -> stationId 18788
    });

    it('should handle multiple stations with same style', () => {
      const testStations = createMockStations(4);
      const queryStorage = new QueryStorage({
        c1: 'Bw==', // bits 0,1,2 set
      });
      
      StationStyleSerializer.deserialize(queryStorage, testStations);
      
      expect(queryStorage.getItem('18786')).toBe('1'); // internalId 0
      expect(queryStorage.getItem('18787')).toBe('1'); // internalId 1  
      expect(queryStorage.getItem('18788')).toBe('1'); // internalId 2
      expect(queryStorage.getItem('18789')).toBeNull(); // internalId 3 not set
    });

    it('should handle sparse data in large dataset', () => {
      const testStations = createMockStations(100);
      const queryStorage = new QueryStorage({
        c1: 'AAIAAAAAAAAAAAAACA==', // bits 9 and 99 set
        c2: 'AAAAAQ==', // bit 24 set
        c3: 'AAAAAAAAAg==', // bit 49 set
        c4: 'AAAAAAAAAAAABA==', // bit 74 set
      });
      
      StationStyleSerializer.deserialize(queryStorage, testStations);
      
      expect(queryStorage.getItem('18795')).toBe('1');  // index 9
      expect(queryStorage.getItem('18810')).toBe('2');  // index 24
      expect(queryStorage.getItem('18835')).toBe('3');  // index 49
      expect(queryStorage.getItem('18860')).toBe('4');  // index 74
      expect(queryStorage.getItem('18885')).toBe('1');  // index 99
      
      // Verify only these 5 stations are set
      expect(queryStorage.listItems()).toHaveLength(5);
    });

    it('should clear existing data before processing', () => {
      const queryStorage = new QueryStorage({
        c1: 'AQ==', // Only internalId 0
      });
      
      // Pre-populate with different data
      queryStorage.setItem('18787', '2');
      queryStorage.setItem('18788', '3');
      
      StationStyleSerializer.deserialize(queryStorage, mockStations);
      
      // Should only have the data from queries, not the pre-populated data
      expect(queryStorage.getItem('18786')).toBe('1');
      expect(queryStorage.getItem('18787')).toBeNull();
      expect(queryStorage.getItem('18788')).toBeNull();
      expect(queryStorage.listItems()).toEqual(['18786']);
    });
  });

  describe('round trip (serialize -> deserialize)', () => {
    it('should preserve data through serialize/deserialize cycle', () => {
      // Set up original data
      const originalStorage = new QueryStorage();
      originalStorage.setItem('18786', '1');
      originalStorage.setItem('18787', '2');
      originalStorage.setItem('18788', '4');
      
      // Serialize
      const queries = StationStyleSerializer.serialize(originalStorage, mockStations);
      
      // Deserialize into new storage
      const restoredStorage = new QueryStorage(queries);
      StationStyleSerializer.deserialize(restoredStorage, mockStations);
      
      // Verify all data is preserved
      expect(restoredStorage.getItem('18786')).toBe('1');
      expect(restoredStorage.getItem('18787')).toBe('2');
      expect(restoredStorage.getItem('18788')).toBe('4');
      expect(restoredStorage.listItems()).toHaveLength(3);
    });

    it('should preserve empty state through round trip', () => {
      const originalStorage = new QueryStorage();
      
      // Serialize empty storage
      const queries = StationStyleSerializer.serialize(originalStorage, mockStations);
      
      // Deserialize
      const restoredStorage = new QueryStorage(queries);
      StationStyleSerializer.deserialize(restoredStorage, mockStations);
      
      expect(restoredStorage.listItems()).toEqual([]);
    });

    it('should preserve complex data patterns through round trip', () => {
      const testStations = createMockStations(50);
      const originalStorage = new QueryStorage();
      
      // Set up complex pattern
      originalStorage.setItem('18786', '1'); // index 0
      originalStorage.setItem('18787', '1'); // index 1
      originalStorage.setItem('18790', '2'); // index 4
      originalStorage.setItem('18800', '3'); // index 14
      originalStorage.setItem('18820', '4'); // index 34
      originalStorage.setItem('18835', '1'); // index 49
      
      // Serialize
      const queries = StationStyleSerializer.serialize(originalStorage, testStations);
      
      // Deserialize
      const restoredStorage = new QueryStorage(queries);
      StationStyleSerializer.deserialize(restoredStorage, testStations);
      
      // Verify all data is preserved exactly
      expect(restoredStorage.getItem('18786')).toBe('1');
      expect(restoredStorage.getItem('18787')).toBe('1');
      expect(restoredStorage.getItem('18790')).toBe('2');
      expect(restoredStorage.getItem('18800')).toBe('3');
      expect(restoredStorage.getItem('18820')).toBe('4');
      expect(restoredStorage.getItem('18835')).toBe('1');
      expect(restoredStorage.listItems()).toHaveLength(6);
      
      // Verify no extra data
      expect(restoredStorage.getItem('18788')).toBeNull();
      expect(restoredStorage.getItem('18799')).toBeNull();
    });

    it('should handle style transitions correctly in round trip', () => {
      const originalStorage = new QueryStorage();
      
      // Test each style type
      originalStorage.setItem('18786', '1');
      originalStorage.setItem('18787', '2');
      originalStorage.setItem('18788', '3');
      // Note: not setting any style 4 to ensure it handles missing styles
      
      // First round trip
      const queries1 = StationStyleSerializer.serialize(originalStorage, mockStations);
      const restored1 = new QueryStorage(queries1);
      StationStyleSerializer.deserialize(restored1, mockStations);
      
      // Second round trip (should be identical)
      const queries2 = StationStyleSerializer.serialize(restored1, mockStations);
      const restored2 = new QueryStorage(queries2);
      StationStyleSerializer.deserialize(restored2, mockStations);
      
      // All round trips should be identical
      expect(restored2.getItem('18786')).toBe('1');
      expect(restored2.getItem('18787')).toBe('2');
      expect(restored2.getItem('18788')).toBe('3');
      expect(restored2.listItems()).toHaveLength(3);
      
      // Verify queries are identical across round trips
      expect(queries1).toEqual(queries2);
    });
  });
});
