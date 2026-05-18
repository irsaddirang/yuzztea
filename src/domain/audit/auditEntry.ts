/**
 * Audit Entry — pure functions for constructing and querying audit log entries.
 *
 * buildAuditEntry: Creates an immutable audit record with:
 * - Timestamp in ISO 8601 format, Asia/Jakarta timezone
 * - value_before / value_after truncated to 2000 characters
 * - Sensitive keys (password, token) scrubbed from JSON values
 * - Always succeeds regardless of authorization status (Req 14.1)
 *
 * queryAuditLog: Filters and paginates audit entries with:
 * - Default range: 30 days
 * - Maximum range: 24 months (rejects if exceeded)
 * - Sort: created_at descending
 * - Page size: 50 entries per page
 *
 * Properties 22, 23
 * Validates: Requirements 14.1, 14.2, 14.3, 14.4, 2.8, 3.5, 5.7
 */

import { formatInTimeZone } from 'date-fns-tz';
import { v4 as uuidv4 } from 'uuid';

// ─── Constants ───────────────────────────────────────────────────────────────

const TIMEZONE = 'Asia/Jakarta';
const MAX_VALUE_LENGTH = 2000;
const PAGE_SIZE = 50;
const DEFAULT_RANGE_DAYS = 30;
const MAX_RANGE_MONTHS = 24;

/**
 * Regex pattern matching keys that should be scrubbed from audit values.
 * Matches any key containing "password" or "token" (case-insensitive).
 */
const SENSITIVE_KEY_PATTERN = /password|token/i;

// ─── Types ───────────────────────────────────────────────────────────────────

export type AuditEntryInput = {
  user: string;
  role: string;
  outletId?: string | null;
  action_type: string;
  entity: string;
  entityId: string;
  valueBefore: unknown;
  valueAfter: unknown;
  now: Date;
};

export type AuditEntry = {
  id: string;
  user_id: string;
  role: string;
  outlet_id: string | null;
  action_type: string;
  entity: string;
  entity_id: string;
  value_before: string;
  value_after: string;
  created_at: string;
};

export type AuditLogFilter = {
  startDate?: Date;
  endDate?: Date;
  actionType?: string;
  outletId?: string;
  userId?: string;
  page?: number;
};

export type AuditLogPage = {
  entries: AuditEntry[];
  page: number;
  pageSize: number;
  totalEntries: number;
  totalPages: number;
};

export type AuditLogFilterResult =
  | { ok: true; data: AuditLogPage }
  | { ok: false; error: 'RANGE_EXCEEDS_24_MONTHS' | 'START_AFTER_END' };

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Recursively scrub sensitive keys from an object.
 * Keys matching "password" or "token" (case-insensitive) are replaced with "[REDACTED]".
 */
function scrubSensitiveKeys(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(scrubSensitiveKeys);
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = scrubSensitiveKeys(val);
      }
    }
    return result;
  }

  return value;
}

/**
 * Serialize a value to JSON string, scrub sensitive keys, and truncate to maxLength.
 */
function serializeAndTruncate(value: unknown, maxLength: number): string {
  if (value === null || value === undefined) {
    return '';
  }

  const scrubbed = scrubSensitiveKeys(value);
  const json = JSON.stringify(scrubbed);

  if (json.length <= maxLength) {
    return json;
  }

  return json.slice(0, maxLength);
}

/**
 * Format a Date to ISO 8601 string in Asia/Jakarta timezone.
 */
function formatTimestamp(date: Date): string {
  return formatInTimeZone(date, TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

/**
 * Calculate the difference in months between two dates (approximate).
 */
function diffInMonths(start: Date, end: Date): number {
  const msPerMonth = 30.44 * 24 * 60 * 60 * 1000;
  return (end.getTime() - start.getTime()) / msPerMonth;
}

// ─── Core Functions ──────────────────────────────────────────────────────────

/**
 * Build an audit log entry from the given input.
 *
 * - Generates a UUID v4 id
 * - Formats timestamp in ISO 8601 Asia/Jakarta
 * - Scrubs sensitive keys (password, token) from valueBefore/valueAfter
 * - Truncates value_before/value_after to 2000 characters
 * - Always succeeds regardless of authorization status (Req 14.1)
 *
 * @param input - The audit entry input parameters
 * @returns A fully constructed AuditEntry record
 */
export function buildAuditEntry(input: AuditEntryInput): AuditEntry {
  return {
    id: uuidv4(),
    user_id: input.user,
    role: input.role,
    outlet_id: input.outletId ?? null,
    action_type: input.action_type,
    entity: input.entity,
    entity_id: input.entityId,
    value_before: serializeAndTruncate(input.valueBefore, MAX_VALUE_LENGTH),
    value_after: serializeAndTruncate(input.valueAfter, MAX_VALUE_LENGTH),
    created_at: formatTimestamp(input.now),
  };
}

/**
 * Query and paginate audit log entries with filtering.
 *
 * - Default date range: 30 days from `now` (or endDate if provided)
 * - Maximum range: 24 months; rejects with error if exceeded
 * - Sort: created_at descending
 * - Page size: 50 entries per page
 * - Filters: actionType, outletId, userId, date range
 *
 * @param entries - The full list of audit entries to query
 * @param filter - Filter and pagination parameters
 * @param now - Current time reference (for default range calculation)
 * @returns Paginated result or error if date range is invalid
 */
export function queryAuditLog(
  entries: AuditEntry[],
  filter: AuditLogFilter,
  now: Date = new Date(),
): AuditLogFilterResult {
  const page = filter.page ?? 1;

  // Determine date range with defaults
  const endDate = filter.endDate ?? now;
  const defaultStart = new Date(endDate.getTime() - DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000);
  const startDate = filter.startDate ?? defaultStart;

  // Validate: start must not be after end
  if (startDate.getTime() > endDate.getTime()) {
    return { ok: false, error: 'START_AFTER_END' };
  }

  // Validate: range must not exceed 24 months
  if (diffInMonths(startDate, endDate) > MAX_RANGE_MONTHS) {
    return { ok: false, error: 'RANGE_EXCEEDS_24_MONTHS' };
  }

  // Filter entries
  const filtered = entries.filter((entry) => {
    const entryDate = new Date(entry.created_at);

    // Date range filter
    if (entryDate < startDate || entryDate > endDate) {
      return false;
    }

    // Action type filter
    if (filter.actionType && entry.action_type !== filter.actionType) {
      return false;
    }

    // Outlet filter
    if (filter.outletId && entry.outlet_id !== filter.outletId) {
      return false;
    }

    // User filter
    if (filter.userId && entry.user_id !== filter.userId) {
      return false;
    }

    return true;
  });

  // Sort by created_at descending
  const sorted = [...filtered].sort((a, b) => {
    const dateA = new Date(a.created_at).getTime();
    const dateB = new Date(b.created_at).getTime();
    return dateB - dateA;
  });

  // Paginate
  const totalEntries = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalEntries / PAGE_SIZE));
  const startIndex = (page - 1) * PAGE_SIZE;
  const pageEntries = sorted.slice(startIndex, startIndex + PAGE_SIZE);

  return {
    ok: true,
    data: {
      entries: pageEntries,
      page,
      pageSize: PAGE_SIZE,
      totalEntries,
      totalPages,
    },
  };
}

// ─── Exported Constants (for testing) ────────────────────────────────────────

export const AUDIT_CONSTANTS = {
  TIMEZONE,
  MAX_VALUE_LENGTH,
  PAGE_SIZE,
  DEFAULT_RANGE_DAYS,
  MAX_RANGE_MONTHS,
} as const;
