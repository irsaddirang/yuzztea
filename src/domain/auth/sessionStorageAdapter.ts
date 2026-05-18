/**
 * Session storage adapter for Yuzztea POS SaaS.
 *
 * Stores session data exclusively in `sessionStorage` with the key prefix
 * `yuzztea_session_`. Ensures:
 * - Password fields are NEVER persisted to any storage.
 * - Tokens/session data are NEVER written to localStorage, URL, or hash.
 * - `clearSession()` removes all keys with the prefix from sessionStorage.
 *
 * Pure adapter — interacts only with `window.sessionStorage`.
 *
 * @module domain/auth/sessionStorageAdapter
 * @see Requirements 1.4, 15.4, 15.5, 15.6
 * @see Property 26: Storage hygiene
 */

/** Key prefix for all session-related entries in sessionStorage */
export const SESSION_KEY_PREFIX = 'yuzztea_session_';

/** The specific key used to store the serialized session data */
export const SESSION_DATA_KEY = `${SESSION_KEY_PREFIX}data`;

/**
 * Fields that must be stripped before persisting session data.
 * These are sensitive credential fields that should never be stored.
 */
const SENSITIVE_FIELDS: ReadonlySet<string> = new Set([
  'password',
  'Password',
  'PASSWORD',
  'secret',
  'token_hash',
]);

/**
 * Minimal session shape accepted by the adapter.
 * The adapter is generic — it accepts any object and strips sensitive fields.
 */
export interface StorableSession {
  [key: string]: unknown;
}

/**
 * Recursively strips sensitive fields (e.g. `password`) from an object.
 * Returns a new object without mutating the original.
 */
export function stripSensitiveFields<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_FIELDS.has(key)) {
      continue;
    }

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = stripSensitiveFields(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        item !== null && typeof item === 'object' && !Array.isArray(item)
          ? stripSensitiveFields(item as Record<string, unknown>)
          : item,
      );
    } else {
      result[key] = value;
    }
  }

  return result as Partial<T>;
}

/**
 * Stores a session object in `sessionStorage` under the `yuzztea_session_` prefix.
 *
 * - Strips any `password` (and other sensitive) fields before serialization.
 * - Writes ONLY to `sessionStorage` — never to `localStorage`, URL, or hash.
 *
 * @param session - The session object to persist (password fields will be removed)
 * @throws If sessionStorage is unavailable (e.g. private browsing quota exceeded)
 */
export function storeSession(session: StorableSession): void {
  const sanitized = stripSensitiveFields(session);
  const serialized = JSON.stringify(sanitized);
  sessionStorage.setItem(SESSION_DATA_KEY, serialized);
}

/**
 * Retrieves the stored session from `sessionStorage`.
 *
 * @returns The parsed session object, or `null` if no session is stored.
 */
export function retrieveSession(): StorableSession | null {
  const raw = sessionStorage.getItem(SESSION_DATA_KEY);
  if (raw === null) {
    return null;
  }

  try {
    return JSON.parse(raw) as StorableSession;
  } catch {
    // Corrupted data — treat as no session
    return null;
  }
}

/**
 * Clears all session-related keys from `sessionStorage`.
 * Removes every key that starts with `yuzztea_session_`.
 *
 * This ensures no session tokens or data remain after logout.
 */
export function clearSession(): void {
  const keysToRemove: string[] = [];

  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key !== null && key.startsWith(SESSION_KEY_PREFIX)) {
      keysToRemove.push(key);
    }
  }

  for (const key of keysToRemove) {
    sessionStorage.removeItem(key);
  }
}
