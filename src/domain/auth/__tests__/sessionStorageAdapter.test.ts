import { describe, it, expect, beforeEach } from 'vitest';

import {
  storeSession,
  retrieveSession,
  clearSession,
  stripSensitiveFields,
  SESSION_KEY_PREFIX,
  SESSION_DATA_KEY,
} from '../sessionStorageAdapter';

describe('sessionStorageAdapter', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  describe('storeSession', () => {
    it('writes session data to sessionStorage with the correct key', () => {
      const session = { userId: 'u1', role: 'owner', outletIds: ['o1'] };
      storeSession(session);

      const stored = sessionStorage.getItem(SESSION_DATA_KEY);
      expect(stored).not.toBeNull();
      expect(JSON.parse(stored!)).toEqual(session);
    });

    it('strips password fields before storing', () => {
      const session = { userId: 'u1', role: 'cashier', password: 'secret123' };
      storeSession(session);

      const stored = JSON.parse(sessionStorage.getItem(SESSION_DATA_KEY)!);
      expect(stored).not.toHaveProperty('password');
      expect(stored.userId).toBe('u1');
      expect(stored.role).toBe('cashier');
    });

    it('strips nested password fields', () => {
      const session = {
        userId: 'u1',
        credentials: { password: 'hidden', token: 'abc' },
      };
      storeSession(session);

      const stored = JSON.parse(sessionStorage.getItem(SESSION_DATA_KEY)!);
      expect(stored.credentials).not.toHaveProperty('password');
      expect(stored.credentials.token).toBe('abc');
    });

    it('does NOT write to localStorage', () => {
      const session = { userId: 'u1', role: 'owner' };
      storeSession(session);

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        expect(key).not.toContain(SESSION_KEY_PREFIX);
      }
    });

    it('does NOT modify window.location.hash', () => {
      const originalHash = window.location.hash;
      const session = { userId: 'u1', token: 'jwt-token' };
      storeSession(session);

      expect(window.location.hash).toBe(originalHash);
    });

    it('uses the yuzztea_session_ prefix for the key', () => {
      storeSession({ userId: 'u1' });
      expect(SESSION_DATA_KEY.startsWith(SESSION_KEY_PREFIX)).toBe(true);
    });
  });

  describe('retrieveSession', () => {
    it('returns the stored session object', () => {
      const session = { userId: 'u1', role: 'outlet_manager', outletIds: ['o1', 'o2'] };
      sessionStorage.setItem(SESSION_DATA_KEY, JSON.stringify(session));

      const result = retrieveSession();
      expect(result).toEqual(session);
    });

    it('returns null when no session is stored', () => {
      expect(retrieveSession()).toBeNull();
    });

    it('returns null when stored data is corrupted JSON', () => {
      sessionStorage.setItem(SESSION_DATA_KEY, '{invalid json');
      expect(retrieveSession()).toBeNull();
    });
  });

  describe('clearSession', () => {
    it('removes all keys with the yuzztea_session_ prefix', () => {
      sessionStorage.setItem(`${SESSION_KEY_PREFIX}data`, '{"a":1}');
      sessionStorage.setItem(`${SESSION_KEY_PREFIX}token`, '"jwt"');
      sessionStorage.setItem(`${SESSION_KEY_PREFIX}extra`, '"x"');
      sessionStorage.setItem('other_key', '"keep"');

      clearSession();

      expect(sessionStorage.getItem(`${SESSION_KEY_PREFIX}data`)).toBeNull();
      expect(sessionStorage.getItem(`${SESSION_KEY_PREFIX}token`)).toBeNull();
      expect(sessionStorage.getItem(`${SESSION_KEY_PREFIX}extra`)).toBeNull();
      expect(sessionStorage.getItem('other_key')).toBe('"keep"');
    });

    it('does nothing when no session keys exist', () => {
      sessionStorage.setItem('unrelated', 'value');
      clearSession();
      expect(sessionStorage.getItem('unrelated')).toBe('value');
    });

    it('leaves no yuzztea_session_ keys after clearing', () => {
      storeSession({ userId: 'u1', role: 'cashier' });
      clearSession();

      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        expect(key).not.toContain(SESSION_KEY_PREFIX);
      }
    });
  });

  describe('stripSensitiveFields', () => {
    it('removes password field from flat object', () => {
      const result = stripSensitiveFields({ name: 'test', password: 'secret' });
      expect(result).toEqual({ name: 'test' });
    });

    it('removes Password (capitalized) field', () => {
      const result = stripSensitiveFields({ name: 'test', Password: 'secret' });
      expect(result).toEqual({ name: 'test' });
    });

    it('removes password from nested objects', () => {
      const result = stripSensitiveFields({
        user: { id: '1', password: 'hidden' },
      });
      expect(result).toEqual({ user: { id: '1' } });
    });

    it('removes password from objects inside arrays', () => {
      const result = stripSensitiveFields({
        users: [
          { id: '1', password: 'p1' },
          { id: '2', password: 'p2' },
        ],
      });
      expect(result).toEqual({
        users: [{ id: '1' }, { id: '2' }],
      });
    });

    it('preserves non-sensitive fields', () => {
      const input = { userId: 'u1', role: 'owner', outletIds: ['o1', 'o2'], active: true };
      const result = stripSensitiveFields(input);
      expect(result).toEqual(input);
    });

    it('does not mutate the original object', () => {
      const input = { userId: 'u1', password: 'secret' };
      stripSensitiveFields(input);
      expect(input.password).toBe('secret');
    });
  });
});
