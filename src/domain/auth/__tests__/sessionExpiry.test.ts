import { describe, it, expect } from 'vitest';

import { isSessionExpired, touchActivity, SESSION_TIMEOUT_MS } from '../sessionExpiry';

describe('sessionExpiry', () => {
  describe('isSessionExpired', () => {
    it('returns false when elapsed time is less than 12 hours', () => {
      const lastActivity = 1000;
      const now = lastActivity + SESSION_TIMEOUT_MS - 1;
      expect(isSessionExpired(lastActivity, now)).toBe(false);
    });

    it('returns true when elapsed time is exactly 12 hours', () => {
      const lastActivity = 1000;
      const now = lastActivity + SESSION_TIMEOUT_MS;
      expect(isSessionExpired(lastActivity, now)).toBe(true);
    });

    it('returns true when elapsed time exceeds 12 hours', () => {
      const lastActivity = 1000;
      const now = lastActivity + SESSION_TIMEOUT_MS + 1;
      expect(isSessionExpired(lastActivity, now)).toBe(true);
    });

    it('returns false when now equals lastActivityAt (zero elapsed)', () => {
      const ts = Date.now();
      expect(isSessionExpired(ts, ts)).toBe(false);
    });
  });

  describe('touchActivity', () => {
    it('updates lastActivityAt to the given timestamp', () => {
      const state = { lastActivityAt: 1000, otherField: 'preserved' };
      const now = 5000;
      const result = touchActivity(state, now);
      expect(result.lastActivityAt).toBe(5000);
      expect(result.otherField).toBe('preserved');
    });

    it('returns a new object (immutable)', () => {
      const state = { lastActivityAt: 1000 };
      const result = touchActivity(state, 2000);
      expect(result).not.toBe(state);
    });
  });

  describe('SESSION_TIMEOUT_MS', () => {
    it('equals 12 hours in milliseconds', () => {
      expect(SESSION_TIMEOUT_MS).toBe(43_200_000);
    });
  });
});
