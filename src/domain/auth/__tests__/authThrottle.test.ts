import { describe, it, expect } from 'vitest';

import { initialThrottleState, recordFailure, canAttempt } from '../authThrottle';

import type { ThrottleState } from '../authThrottle';

describe('authThrottle', () => {
  describe('initialThrottleState', () => {
    it('returns empty state with no throttling', () => {
      const state = initialThrottleState();
      expect(state.failures).toEqual([]);
      expect(state.nextAllowedAt).toBe(0);
    });
  });

  describe('recordFailure', () => {
    it('records failures without throttling for first 5 attempts', () => {
      let state = initialThrottleState();
      const baseTime = 1000000;

      for (let i = 1; i <= 5; i++) {
        state = recordFailure(state, baseTime + i * 1000);
        expect(state.failures).toHaveLength(i);
        expect(state.nextAllowedAt).toBe(0);
      }
    });

    it('applies backoff after 6th failure: 2^1 * 1000 = 2000ms', () => {
      let state = initialThrottleState();
      const baseTime = 1000000;

      for (let i = 1; i <= 5; i++) {
        state = recordFailure(state, baseTime + i * 1000);
      }

      // 6th failure
      const sixthTime = baseTime + 6000;
      state = recordFailure(state, sixthTime);
      expect(state.failures).toHaveLength(6);
      expect(state.nextAllowedAt).toBe(sixthTime + 2000); // 2^(6-5)*1000 = 2000
    });

    it('applies backoff after 7th failure: 2^2 * 1000 = 4000ms', () => {
      let state = initialThrottleState();
      const baseTime = 1000000;

      for (let i = 1; i <= 6; i++) {
        state = recordFailure(state, baseTime + i * 1000);
      }

      const seventhTime = baseTime + 7000;
      state = recordFailure(state, seventhTime);
      expect(state.nextAllowedAt).toBe(seventhTime + 4000); // 2^(7-5)*1000 = 4000
    });

    it('caps backoff at 300_000ms (5 minutes)', () => {
      let state = initialThrottleState();
      const baseTime = 1000000;

      // 5 + 19 = 24 failures → 2^19 * 1000 = 524_288_000 > 300_000
      for (let i = 1; i <= 24; i++) {
        state = recordFailure(state, baseTime + i * 100);
      }

      expect(state.nextAllowedAt).toBe(baseTime + 24 * 100 + 300_000);
    });

    it('prunes failures outside the 10-minute window', () => {
      let state = initialThrottleState();
      const tenMinMs = 10 * 60 * 1000;

      // Add 5 failures at time 0-4000
      for (let i = 0; i < 5; i++) {
        state = recordFailure(state, i * 1000);
      }

      // Now record a failure well after the 10-minute window
      const laterTime = tenMinMs + 5000;
      state = recordFailure(state, laterTime);

      // Old failures should be pruned, only the new one remains
      expect(state.failures).toHaveLength(1);
      expect(state.failures[0].ts).toBe(laterTime);
      expect(state.nextAllowedAt).toBe(0); // Only 1 failure, no throttle
    });
  });

  describe('canAttempt', () => {
    it('allows attempt when no throttling is active', () => {
      const state = initialThrottleState();
      const result = canAttempt(state, 1000);
      expect(result).toEqual({ ok: true, waitMs: 0 });
    });

    it('allows attempt when current time is past nextAllowedAt', () => {
      const state: ThrottleState = {
        failures: [
          { ts: 1000 },
          { ts: 2000 },
          { ts: 3000 },
          { ts: 4000 },
          { ts: 5000 },
          { ts: 6000 },
        ],
        nextAllowedAt: 8000,
      };

      const result = canAttempt(state, 9000);
      expect(result).toEqual({ ok: true, waitMs: 0 });
    });

    it('blocks attempt and returns remaining wait time', () => {
      const state: ThrottleState = {
        failures: [
          { ts: 1000 },
          { ts: 2000 },
          { ts: 3000 },
          { ts: 4000 },
          { ts: 5000 },
          { ts: 6000 },
        ],
        nextAllowedAt: 8000,
      };

      const result = canAttempt(state, 7000);
      expect(result).toEqual({ ok: false, waitMs: 1000 });
    });

    it('allows attempt exactly at nextAllowedAt', () => {
      const state: ThrottleState = {
        failures: [
          { ts: 1000 },
          { ts: 2000 },
          { ts: 3000 },
          { ts: 4000 },
          { ts: 5000 },
          { ts: 6000 },
        ],
        nextAllowedAt: 8000,
      };

      const result = canAttempt(state, 8000);
      expect(result).toEqual({ ok: true, waitMs: 0 });
    });
  });

  describe('backoff progression', () => {
    it('follows exponential backoff: 2s, 4s, 8s, 16s, 32s, 64s, 128s, 256s, 300s (cap)', () => {
      let state = initialThrottleState();
      const baseTime = 100000;

      // First 5 failures: no throttle
      for (let i = 1; i <= 5; i++) {
        state = recordFailure(state, baseTime + i * 1000);
      }

      const expectedBackoffs = [2000, 4000, 8000, 16000, 32000, 64000, 128000, 256000, 300000];

      for (let i = 0; i < expectedBackoffs.length; i++) {
        const failTime = baseTime + (6 + i) * 1000;
        state = recordFailure(state, failTime);
        expect(state.nextAllowedAt).toBe(failTime + expectedBackoffs[i]);
      }
    });
  });
});
