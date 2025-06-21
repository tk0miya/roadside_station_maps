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
    it('should fetch and parse station list for Kanagawa prefecture', async () => {
      // Prepare Kanagawa prefecture object
      const kanagawa = {
        id: '23',
        name: '神奈川',
        uri: '/stations/search/23/all/all'
      };

      // Execute the function with real HTTP request
      const stations = await Array.fromAsync(getStations(kanagawa));

      // Verify we got exactly 5 stations in Kanagawa
      expect(stations).toHaveLength(5);

      // Verify all stations have the correct prefecture ID
      stations.forEach(station => {
        expect(station.pref_id).toBe('23');
      });

      // Check for some known stations in Kanagawa
      const stationNames = stations.map(s => s.name);
      expect(stationNames).toContain('山北');
      expect(stationNames).toContain('箱根峠');
      expect(stationNames).toContain('清川');
    });
  });

  describe('getStationDetails', () => {
    it('should fetch and parse station details from a specific station page', async () => {
      // Test with station ID 19150
      const stationUri = '/stations/views/19150';
      const prefId = '23'; // Kanagawa
      
      const station = await getStationDetails(stationUri, prefId);
      
      // Verify station structure
      expect(station).toHaveProperty('pref_id', '23');
      expect(station).toHaveProperty('station_id', '19150');
      expect(station).toHaveProperty('name');
      expect(station).toHaveProperty('address');
      expect(station).toHaveProperty('tel');
      expect(station).toHaveProperty('hours');
      expect(station).toHaveProperty('uri');
      expect(station).toHaveProperty('lat');
      expect(station).toHaveProperty('lng');
      
      // Verify specific station data
      expect(station.name).toBe('箱根峠');
      expect(station.address).toContain('神奈川県');
      
      // Verify coordinates are valid numbers (not 'None')
      const lat = parseFloat(station.lat);
      const lng = parseFloat(station.lng);
      expect(isNaN(lat)).toBe(false);
      expect(isNaN(lng)).toBe(false);
      expect(lat).toBeGreaterThan(0);
      expect(lng).toBeGreaterThan(0);
    });
  });
});