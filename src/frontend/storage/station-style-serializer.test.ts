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

      // c1: bit 0 set: [1] -> "AQ=="
      expect(queries.c1).toBe('AQ==');
      // c2: bit 1 set: [2] -> "Ag=="
      expect(queries.c2).toBe('Ag==');
      expect(queries.c3).toBe('');
      // c4: bit 2 set: [4] -> "BA=="
      expect(queries.c4).toBe('BA==');
    });

    it('should handle multiple stations with same style', () => {
      const testStations = createMockStations(4);
      const queryStorage = new QueryStorage();

      queryStorage.setItem('18786', '1'); // internalId 0
      queryStorage.setItem('18787', '1'); // internalId 1
      queryStorage.setItem('18788', '1'); // internalId 2

      const queries = StationStyleSerializer.serialize(queryStorage, testStations);

      // c1: bits 0,1,2 set: [7] -> "Bw=="
      expect(queries.c1).toBe('Bw==');
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
      expect(queries.c1).toBe('AAIAAAAAAAAAAAAACA==');

      // c2: bit 24 set
      expect(queries.c2).toBe('AAAAAQ==');

      // c3: bit 49 set
      expect(queries.c3).toBe('AAAAAAAAAg==');

      // c4: bit 74 set
      expect(queries.c4).toBe('AAAAAAAAAAAABA==');
    });

    it('should skip stations not in the stations data', () => {
      const queryStorage = new QueryStorage();
      queryStorage.setItem('18786', '1'); // exists in mockStations
      queryStorage.setItem('99999', '2'); // does not exist in mockStations

      const queries = StationStyleSerializer.serialize(queryStorage, mockStations);

      expect(queries.c1).toBe('AQ=='); // Only 18786 should be encoded
      expect(queries.c2).toBe(''); // 99999 should be skipped
      expect(queries.c3).toBe('');
      expect(queries.c4).toBe('');
    });
  });
});
