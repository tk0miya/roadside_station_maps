/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { QueryStorage } from './query-storage';
import { LocalStorage } from './local-storage';
import { createMockStations } from '../../test-utils/test-utils';

// Mock LocalStorage
vi.mock('./local-storage');

// Create default mock stations for most tests
const mockStations = createMockStations(3);

describe('QueryStorage', () => {

  describe('getItem/setItem/removeItem', () => {
    it('should return null for non-existent item', () => {
      const queryStorage = new QueryStorage();
      
      expect(queryStorage.getItem('18786')).toBeNull();
    });

    it('should store and retrieve style 1', () => {
      const queryStorage = new QueryStorage();
      
      queryStorage.setItem('18786', '1');
      expect(queryStorage.getItem('18786')).toBe('1');
    });

    it('should store and retrieve style 2', () => {
      const queryStorage = new QueryStorage();
      
      queryStorage.setItem('18787', '2');
      expect(queryStorage.getItem('18787')).toBe('2');
    });

    it('should store and retrieve style 3', () => {
      const queryStorage = new QueryStorage();
      
      queryStorage.setItem('18788', '3');
      expect(queryStorage.getItem('18788')).toBe('3');
    });

    it('should store and retrieve style 4', () => {
      const queryStorage = new QueryStorage();
      
      queryStorage.setItem('18786', '4');
      expect(queryStorage.getItem('18786')).toBe('4');
    });

    it('should remove item from all sets when setting new style', () => {
      const queryStorage = new QueryStorage();
      
      queryStorage.setItem('18786', '1');
      queryStorage.setItem('18786', '2');
      
      expect(queryStorage.getItem('18786')).toBe('2');
    });

    it('should remove item completely', () => {
      const queryStorage = new QueryStorage();
      
      queryStorage.setItem('18786', '3');
      queryStorage.removeItem('18786');
      
      expect(queryStorage.getItem('18786')).toBeNull();
    });
  });

  describe('listItems', () => {
    it('should return empty array when no items are stored', () => {
      const queryStorage = new QueryStorage();
      
      expect(queryStorage.listItems()).toEqual([]);
    });

    it('should list all stored station IDs', () => {
      const queryStorage = new QueryStorage();
      
      queryStorage.setItem('18786', '1');
      queryStorage.setItem('18787', '2');
      queryStorage.setItem('18788', '3');

      const items = queryStorage.listItems();
      expect(items).toEqual(expect.arrayContaining(['18786', '18787', '18788']));
      expect(items).toHaveLength(3);
    });
  });

  describe('toQuery', () => {
    it('should return empty strings for empty sets', () => {
      const queryStorage = new QueryStorage();
      queryStorage.setStationsData(mockStations);
      
      const queries = queryStorage.toQuery();
      
      expect(queries.c1).toBe('');
      expect(queries.c2).toBe('');
      expect(queries.c3).toBe('');
      expect(queries.c4).toBe('');
    });

    it('should encode single station styles to queries', () => {
      const queryStorage = new QueryStorage();
      queryStorage.setStationsData(mockStations);
      
      queryStorage.setItem('18786', '1'); // internalId 0
      
      const queries = queryStorage.toQuery();
      
      // Bitmap with bit 0 set: [1] -> Base64 "AQ=="
      expect(queries.c1).toBe('AQ==');
      expect(queries.c2).toBe('');
      expect(queries.c3).toBe('');
      expect(queries.c4).toBe('');
    });

    it('should encode multiple stations with different styles', () => {
      const queryStorage = new QueryStorage();
      queryStorage.setStationsData(mockStations);
      
      queryStorage.setItem('18786', '1'); // internalId 0
      queryStorage.setItem('18787', '2'); // internalId 1
      queryStorage.setItem('18788', '4'); // internalId 2
      
      const queries = queryStorage.toQuery();
      
      // c1: bit 0 set: [1] -> "AQ=="
      expect(queries.c1).toBe('AQ==');
      // c2: bit 1 set: [2] -> "Ag=="
      expect(queries.c2).toBe('Ag==');
      expect(queries.c3).toBe('');
      // c4: bit 2 set: [4] -> "BA=="
      expect(queries.c4).toBe('BA==');
    });
  });

  describe('loadFromQueries', () => {
    it('should process queries after stations data is set', () => {
      const queryStorage = new QueryStorage();
      
      // Load queries first (they will be pending)
      queryStorage.loadFromQueries({
        c1: 'AQ==', // Base64 for [1] - represents internalId 0
        c2: 'Ag==', // Base64 for [2] - represents internalId 1
      });

      // Queries should not be accessible yet
      expect(queryStorage.getItem('18786')).toBeNull();
      expect(queryStorage.getItem('18787')).toBeNull();

      // Set stations data to trigger processing
      queryStorage.setStationsData(mockStations);

      // Now queries should be processed and stations mapped
      expect(queryStorage.getItem('18786')).toBe('1'); // internalId 0 -> stationId 18786
      expect(queryStorage.getItem('18787')).toBe('2'); // internalId 1 -> stationId 18787
    });

    it('should handle empty queries', () => {
      const queryStorage = new QueryStorage();
      
      queryStorage.loadFromQueries({});
      queryStorage.setStationsData(mockStations);
      
      expect(queryStorage.listItems()).toEqual([]);
    });

    it('should handle queries with all style types', () => {
      const queryStorage = new QueryStorage();
      
      // Create queries for all 4 styles with different stations
      queryStorage.loadFromQueries({
        c1: 'AQ==', // Base64 for [1] - internalId 0
        c2: 'Ag==', // Base64 for [2] - internalId 1  
        c3: 'BA==', // Base64 for [4] - internalId 2
        c4: '', // Empty
      });

      queryStorage.setStationsData(mockStations);

      expect(queryStorage.getItem('18786')).toBe('1');
      expect(queryStorage.getItem('18787')).toBe('2');
      expect(queryStorage.getItem('18788')).toBe('3');
    });
  });

  describe('loadFromLocalStorage', () => {
    it('should copy data from LocalStorage', () => {
      const queryStorage = new QueryStorage();
      queryStorage.setStationsData(mockStations);
      
      const mockLocalStorage = {
        listItems: vi.fn().mockReturnValue(['18786', '18787']),
        getItem: vi.fn()
          .mockReturnValueOnce('1')
          .mockReturnValueOnce('2'),
      };

      (LocalStorage as any).mockImplementation(() => mockLocalStorage);

      queryStorage.loadFromLocalStorage();

      expect(mockLocalStorage.listItems).toHaveBeenCalled();
      expect(mockLocalStorage.getItem).toHaveBeenCalledWith('18786');
      expect(mockLocalStorage.getItem).toHaveBeenCalledWith('18787');
      expect(queryStorage.getItem('18786')).toBe('1');
      expect(queryStorage.getItem('18787')).toBe('2');
    });

    it('should clear existing data before loading', () => {
      const queryStorage = new QueryStorage();
      queryStorage.setStationsData(mockStations);
      
      queryStorage.setItem('18788', '3');
      
      const mockLocalStorage = {
        listItems: vi.fn().mockReturnValue(['18786']),
        getItem: vi.fn().mockReturnValue('1'),
      };

      (LocalStorage as any).mockImplementation(() => mockLocalStorage);

      queryStorage.loadFromLocalStorage();

      expect(queryStorage.getItem('18788')).toBeNull();
      expect(queryStorage.getItem('18786')).toBe('1');
    });
  });

  describe('toQuery and loadFromQueries round-trip', () => {
    it('should handle empty data round-trip', () => {
      const queryStorage1 = new QueryStorage();
      queryStorage1.setStationsData(mockStations);

      const queries = queryStorage1.toQuery();

      const queryStorage2 = new QueryStorage();
      queryStorage2.loadFromQueries(queries);
      queryStorage2.setStationsData(mockStations);

      expect(queryStorage2.listItems()).toEqual([]);
    });

    it('should preserve all style types and data through round-trip', () => {
      const testStations = createMockStations(4);
      
      const queryStorage1 = new QueryStorage();
      queryStorage1.setStationsData(testStations);
      
      // Test all 4 style types
      queryStorage1.setItem('18786', '1');
      queryStorage1.setItem('18787', '2');
      queryStorage1.setItem('18788', '3');
      queryStorage1.setItem('18789', '4');

      const queries = queryStorage1.toQuery();

      const queryStorage2 = new QueryStorage();
      queryStorage2.loadFromQueries(queries);
      queryStorage2.setStationsData(testStations);

      // Verify all data is preserved
      expect(queryStorage2.getItem('18786')).toBe('1');
      expect(queryStorage2.getItem('18787')).toBe('2');
      expect(queryStorage2.getItem('18788')).toBe('3');
      expect(queryStorage2.getItem('18789')).toBe('4');
      
      // Verify list is identical
      expect(queryStorage2.listItems().sort()).toEqual(queryStorage1.listItems().sort());
    });

    it('should handle sparse data in large dataset', () => {
      const testStations = createMockStations(100);
      
      const queryStorage1 = new QueryStorage();
      queryStorage1.setStationsData(testStations);
      
      // Set styles for stations at various positions to test sparse bitmap
      queryStorage1.setItem('18795', '1');  // index 9
      queryStorage1.setItem('18810', '2');  // index 24
      queryStorage1.setItem('18835', '3');  // index 49
      queryStorage1.setItem('18860', '4');  // index 74
      queryStorage1.setItem('18885', '1');  // index 99

      const queries = queryStorage1.toQuery();

      const queryStorage2 = new QueryStorage();
      queryStorage2.loadFromQueries(queries);
      queryStorage2.setStationsData(testStations);

      // Verify sparse data is preserved correctly
      expect(queryStorage2.getItem('18795')).toBe('1');
      expect(queryStorage2.getItem('18810')).toBe('2');
      expect(queryStorage2.getItem('18835')).toBe('3');
      expect(queryStorage2.getItem('18860')).toBe('4');
      expect(queryStorage2.getItem('18885')).toBe('1');
      expect(queryStorage2.listItems()).toHaveLength(5);
      
      // Verify unset stations remain null
      expect(queryStorage2.getItem('18786')).toBeNull();
      expect(queryStorage2.getItem('18850')).toBeNull();
    });
  });
});