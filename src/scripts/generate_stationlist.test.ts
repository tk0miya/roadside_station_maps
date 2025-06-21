import { describe, it, expect } from 'vitest';
import { getPrefectures } from './generate_stationlist';

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
});