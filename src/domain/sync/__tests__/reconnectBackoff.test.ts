import { describe, it, expect } from 'vitest';

import { nextReconnectDelay } from '../reconnectBackoff';

describe('reconnectBackoff', () => {
  describe('nextReconnectDelay', () => {
    it('returns expected delay sequence for attempts 1..10', () => {
      const expected = [1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000, 30000, 30000];

      for (let attempt = 1; attempt <= 10; attempt++) {
        expect(nextReconnectDelay(attempt)).toBe(expected[attempt - 1]);
      }
    });

    it('returns null for attempt > 10 (disconnected_terminal)', () => {
      expect(nextReconnectDelay(11)).toBeNull();
      expect(nextReconnectDelay(12)).toBeNull();
      expect(nextReconnectDelay(100)).toBeNull();
    });

    it('returns null for invalid attempt numbers', () => {
      expect(nextReconnectDelay(0)).toBeNull();
      expect(nextReconnectDelay(-1)).toBeNull();
      expect(nextReconnectDelay(1.5)).toBeNull();
    });

    it('caps delay at 30000ms regardless of attempt number within range', () => {
      // Attempts 6-10 should all be capped at 30000ms
      for (let attempt = 6; attempt <= 10; attempt++) {
        expect(nextReconnectDelay(attempt)).toBe(30000);
      }
    });

    it('follows exponential backoff for attempts 1-5', () => {
      expect(nextReconnectDelay(1)).toBe(1000); // 1000 * 2^0
      expect(nextReconnectDelay(2)).toBe(2000); // 1000 * 2^1
      expect(nextReconnectDelay(3)).toBe(4000); // 1000 * 2^2
      expect(nextReconnectDelay(4)).toBe(8000); // 1000 * 2^3
      expect(nextReconnectDelay(5)).toBe(16000); // 1000 * 2^4
    });
  });
});
