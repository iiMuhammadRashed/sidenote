import * as assert from 'assert';
import { formatDate, getRelativeTimeString, getTodayDateString } from '../../src/utils/date-utils';

describe('DateUtils', () => {
  describe('formatDate', () => {
    it('should format dates with tokens YYYY, MM, DD, HH, mm, ss', () => {
      const d = new Date(2026, 8, 2, 14, 5, 9); // Sep 2, 2026 14:05:09
      assert.strictEqual(formatDate(d, 'YYYY-MM-DD'), '2026-09-02');
      assert.strictEqual(formatDate(d, 'YYYY/MM/DD HH:mm:ss'), '2026/09/02 14:05:09');
    });
  });

  describe('getRelativeTimeString', () => {
    const baseNow = 1756770000000; // Fixed timestamp

    it('should return "Just now" for recent timestamps (<45s)', () => {
      assert.strictEqual(getRelativeTimeString(baseNow - 10000, baseNow), 'Just now');
    });

    it('should return minutes ago', () => {
      assert.strictEqual(getRelativeTimeString(baseNow - 5 * 60 * 1000, baseNow), '5m ago');
    });

    it('should return hours ago', () => {
      assert.strictEqual(getRelativeTimeString(baseNow - 3 * 60 * 60 * 1000, baseNow), '3h ago');
    });

    it('should return Yesterday for 1 day elapsed', () => {
      assert.strictEqual(getRelativeTimeString(baseNow - 25 * 60 * 60 * 1000, baseNow), 'Yesterday');
    });

    it('should return days ago for 3 days elapsed', () => {
      assert.strictEqual(getRelativeTimeString(baseNow - 3 * 24 * 60 * 60 * 1000, baseNow), '3d ago');
    });
  });

  describe('getTodayDateString', () => {
    it('should return today formatted date', () => {
      const todayStr = getTodayDateString('YYYY');
      assert.strictEqual(todayStr, String(new Date().getFullYear()));
    });
  });
});
