import { describe, it, expect } from 'vitest';
import { getPrefectures, getStations, getStationDetails } from './generate_stationlist';

describe('generate_stationlist', () => {
  describe('getPrefectures', () => {
    it('should fetch and parse prefecture list from michi-no-eki.jp', async () => {
      // Execute the function with real HTTP request
      const prefectures = await Array.fromAsync(getPrefectures());

      // Japan has 47 prefectures
      expect(prefectures).toHaveLength(47);
      
      // Check for specific known prefectures (should always exist)
      const prefectureNames = prefectures.map(p => p.name);
      
      // Check if we have some expected prefectures
      // Note: Prefecture names on the site don't include suffixes like '都', '府', '県'
      expect(prefectureNames).toContain('北海道');
      expect(prefectureNames).toContain('東京');
      expect(prefectureNames).toContain('大阪');
      expect(prefectureNames).toContain('沖縄');
    });
  });

  describe('getStations', () => {
    it('should fetch and parse station list for Iwate with pagination', async () => {
      // Use Iwate prefecture (ID: 13) to test pagination functionality
      const iwate = {
        id: '13',
        name: '岩手',
        uri: '/stations/search/13/all/all'
      };

      // Execute the function with real HTTP request
      const stations = await Array.fromAsync(getStations(iwate));

      // Iwate has exactly 39 stations
      expect(stations).toHaveLength(39);

      // Verify all stations have the correct prefecture ID
      stations.forEach(station => {
        expect(station.prefId).toBe('13');
      });

      // Check for known stations in Iwate
      const stationNames = stations.map(s => s.name);
      expect(stationNames).toContain('石鳥谷');
      expect(stationNames).toContain('区界高原');
    });
  });

  describe('getStationDetails', () => {
    it('should fetch and parse station details from a specific station page', async () => {
      // Test with station ID 19150 (Hakone-toge in Kanagawa)
      const stationUri = '/stations/views/19150';
      const prefId = '23'; // Kanagawa
      
      const station = await getStationDetails(stationUri, prefId);
      
      // Verify prefecture ID (passed as parameter)
      expect(station.prefId).toBe('23');
      
      // Verify station ID (extracted from URI)
      expect(station.stationId).toBe('19150');
      
      // Verify station name
      expect(station.name).toBe('箱根峠');
      
      // Verify address
      expect(station.address).toContain('神奈川県');
      
      // Verify hours (just check that it has some value, as it changes frequently)
      expect(station.hours.length).toBeGreaterThan(0);
      
      // Verify URI
      expect(station.uri).toContain('/stations/views/19150');
      
      // Verify coordinates are valid numbers (not 'None')
      const lat = parseFloat(station.lat);
      const lng = parseFloat(station.lng);
      expect(isNaN(lat)).toBe(false);
      expect(isNaN(lng)).toBe(false);
      expect(lat).toBeGreaterThan(35); // Rough latitude check for Kanagawa
      expect(lat).toBeLessThan(36);
      expect(lng).toBeGreaterThan(138); // Rough longitude check for Kanagawa
      expect(lng).toBeLessThan(140);
    });
  });
});