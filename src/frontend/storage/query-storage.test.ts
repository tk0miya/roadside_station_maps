/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { QueryStorage } from './query-storage';

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




});