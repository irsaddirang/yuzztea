import { describe, it, expect } from 'vitest';

import {
  buildAuditEntry,
  queryAuditLog,
  type AuditEntry,
  type AuditEntryInput,
} from '../auditEntry';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeInput(overrides: Partial<AuditEntryInput> = {}): AuditEntryInput {
  return {
    user: '550e8400-e29b-41d4-a716-446655440000',
    role: 'owner',
    outletId: '660e8400-e29b-41d4-a716-446655440001',
    action_type: 'menu.price_change',
    entity: 'menu_item',
    entityId: '770e8400-e29b-41d4-a716-446655440002',
    valueBefore: { price: 15000 },
    valueAfter: { price: 20000 },
    now: new Date('2024-06-15T10:30:00Z'),
    ...overrides,
  };
}

function makeEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: '880e8400-e29b-41d4-a716-446655440003',
    user_id: '550e8400-e29b-41d4-a716-446655440000',
    role: 'owner',
    outlet_id: '660e8400-e29b-41d4-a716-446655440001',
    action_type: 'menu.price_change',
    entity: 'menu_item',
    entity_id: '770e8400-e29b-41d4-a716-446655440002',
    value_before: '{"price":15000}',
    value_after: '{"price":20000}',
    created_at: '2024-06-15T17:30:00+07:00',
    ...overrides,
  };
}

// ─── buildAuditEntry Tests ───────────────────────────────────────────────────

describe('buildAuditEntry', () => {
  it('should produce a record with all required fields', () => {
    const input = makeInput();
    const entry = buildAuditEntry(input);

    expect(entry.id).toBeDefined();
    expect(entry.id).toHaveLength(36); // UUID v4 format
    expect(entry.user_id).toBe(input.user);
    expect(entry.role).toBe(input.role);
    expect(entry.outlet_id).toBe(input.outletId);
    expect(entry.action_type).toBe(input.action_type);
    expect(entry.entity).toBe(input.entity);
    expect(entry.entity_id).toBe(input.entityId);
    expect(entry.value_before).toBe('{"price":15000}');
    expect(entry.value_after).toBe('{"price":20000}');
  });

  it('should format timestamp in ISO 8601 Asia/Jakarta timezone', () => {
    // 2024-06-15T10:30:00Z = 2024-06-15T17:30:00+07:00 in Asia/Jakarta
    const input = makeInput({ now: new Date('2024-06-15T10:30:00Z') });
    const entry = buildAuditEntry(input);

    expect(entry.created_at).toBe('2024-06-15T17:30:00+07:00');
  });

  it('should truncate value_before and value_after to 2000 characters', () => {
    const longValue = { data: 'x'.repeat(3000) };
    const input = makeInput({ valueBefore: longValue, valueAfter: longValue });
    const entry = buildAuditEntry(input);

    expect(entry.value_before.length).toBeLessThanOrEqual(2000);
    expect(entry.value_after.length).toBeLessThanOrEqual(2000);
  });

  it('should scrub keys containing "password" from values', () => {
    const input = makeInput({
      valueBefore: { username: 'admin', password: 'secret123', userPassword: 'also-secret' },
      valueAfter: { username: 'admin', password: 'newpass', resetPasswordToken: 'abc' },
    });
    const entry = buildAuditEntry(input);

    const before = JSON.parse(entry.value_before);
    const after = JSON.parse(entry.value_after);

    expect(before.username).toBe('admin');
    expect(before.password).toBe('[REDACTED]');
    expect(before.userPassword).toBe('[REDACTED]');
    expect(after.password).toBe('[REDACTED]');
    expect(after.resetPasswordToken).toBe('[REDACTED]');
  });

  it('should scrub keys containing "token" from values', () => {
    const input = makeInput({
      valueBefore: { accessToken: 'jwt-abc', refreshToken: 'jwt-xyz', name: 'test' },
      valueAfter: { token: 'new-token', name: 'test' },
    });
    const entry = buildAuditEntry(input);

    const before = JSON.parse(entry.value_before);
    const after = JSON.parse(entry.value_after);

    expect(before.accessToken).toBe('[REDACTED]');
    expect(before.refreshToken).toBe('[REDACTED]');
    expect(before.name).toBe('test');
    expect(after.token).toBe('[REDACTED]');
    expect(after.name).toBe('test');
  });

  it('should scrub nested sensitive keys', () => {
    const input = makeInput({
      valueBefore: { user: { name: 'admin', credentials: { password: 'secret' } } },
      valueAfter: null,
    });
    const entry = buildAuditEntry(input);

    const before = JSON.parse(entry.value_before);
    expect(before.user.credentials.password).toBe('[REDACTED]');
    expect(before.user.name).toBe('admin');
  });

  it('should handle null outletId (organization-level actions)', () => {
    const input = makeInput({ outletId: null });
    const entry = buildAuditEntry(input);

    expect(entry.outlet_id).toBeNull();
  });

  it('should handle undefined outletId', () => {
    const input = makeInput({ outletId: undefined });
    const entry = buildAuditEntry(input);

    expect(entry.outlet_id).toBeNull();
  });

  it('should handle null/undefined valueBefore and valueAfter', () => {
    const input = makeInput({ valueBefore: null, valueAfter: undefined });
    const entry = buildAuditEntry(input);

    expect(entry.value_before).toBe('');
    expect(entry.value_after).toBe('');
  });

  it('should succeed even when accessDenied flag is present (Req 14.1)', () => {
    const input = makeInput({
      valueAfter: { accessDenied: true, attempted_outlet_id: 'some-id', action: 'read' },
    });
    const entry = buildAuditEntry(input);

    expect(entry.id).toBeDefined();
    const after = JSON.parse(entry.value_after);
    expect(after.accessDenied).toBe(true);
  });

  it('should generate unique IDs for each call', () => {
    const input = makeInput();
    const entry1 = buildAuditEntry(input);
    const entry2 = buildAuditEntry(input);

    expect(entry1.id).not.toBe(entry2.id);
  });
});

// ─── queryAuditLog Tests ─────────────────────────────────────────────────────

describe('queryAuditLog', () => {
  const now = new Date('2024-06-15T10:00:00Z');

  // Generate entries across different dates
  function generateEntries(count: number): AuditEntry[] {
    return Array.from({ length: count }, (_, i) => {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000); // one per day going back
      return makeEntry({
        id: `entry-${i}`,
        created_at: date.toISOString(),
        action_type: i % 2 === 0 ? 'menu.price_change' : 'stock.opname',
        outlet_id: i % 3 === 0 ? 'outlet-a' : 'outlet-b',
        user_id: i % 4 === 0 ? 'user-1' : 'user-2',
      });
    });
  }

  it('should use default 30-day range when no dates provided', () => {
    const entries = generateEntries(60);
    const result = queryAuditLog(entries, {}, now);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Only entries within last 30 days should be included
    expect(result.data.totalEntries).toBeLessThanOrEqual(31); // 0..30 days back
  });

  it('should sort entries by created_at descending', () => {
    const entries = generateEntries(10);
    const result = queryAuditLog(entries, {}, now);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (let i = 1; i < result.data.entries.length; i++) {
      const prev = new Date(result.data.entries[i - 1]!.created_at).getTime();
      const curr = new Date(result.data.entries[i]!.created_at).getTime();
      expect(prev).toBeGreaterThanOrEqual(curr);
    }
  });

  it('should paginate at 50 entries per page', () => {
    const entries = generateEntries(120);
    // Use a wide date range to include all entries
    const startDate = new Date(now.getTime() - 150 * 24 * 60 * 60 * 1000);
    const result = queryAuditLog(entries, { startDate, endDate: now }, now);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.entries.length).toBe(50);
    expect(result.data.pageSize).toBe(50);
    expect(result.data.totalPages).toBe(3); // 120 / 50 = 2.4 → 3
  });

  it('should return correct page when page > 1', () => {
    const entries = generateEntries(120);
    const startDate = new Date(now.getTime() - 150 * 24 * 60 * 60 * 1000);
    const result = queryAuditLog(entries, { startDate, endDate: now, page: 2 }, now);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.page).toBe(2);
    expect(result.data.entries.length).toBe(50);
  });

  it('should return last page with remaining entries', () => {
    const entries = generateEntries(120);
    const startDate = new Date(now.getTime() - 150 * 24 * 60 * 60 * 1000);
    const result = queryAuditLog(entries, { startDate, endDate: now, page: 3 }, now);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.page).toBe(3);
    expect(result.data.entries.length).toBe(20); // 120 - 50 - 50 = 20
  });

  it('should reject range exceeding 24 months', () => {
    const startDate = new Date('2020-01-01T00:00:00Z');
    const endDate = new Date('2024-06-15T00:00:00Z'); // > 24 months
    const result = queryAuditLog([], { startDate, endDate }, now);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('RANGE_EXCEEDS_24_MONTHS');
  });

  it('should reject when startDate is after endDate', () => {
    const startDate = new Date('2024-06-20T00:00:00Z');
    const endDate = new Date('2024-06-10T00:00:00Z');
    const result = queryAuditLog([], { startDate, endDate }, now);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('START_AFTER_END');
  });

  it('should filter by actionType', () => {
    const entries = generateEntries(20);
    const startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const result = queryAuditLog(
      entries,
      { startDate, endDate: now, actionType: 'stock.opname' },
      now,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const entry of result.data.entries) {
      expect(entry.action_type).toBe('stock.opname');
    }
  });

  it('should filter by outletId', () => {
    const entries = generateEntries(20);
    const startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const result = queryAuditLog(entries, { startDate, endDate: now, outletId: 'outlet-a' }, now);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const entry of result.data.entries) {
      expect(entry.outlet_id).toBe('outlet-a');
    }
  });

  it('should filter by userId', () => {
    const entries = generateEntries(20);
    const startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const result = queryAuditLog(entries, { startDate, endDate: now, userId: 'user-1' }, now);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const entry of result.data.entries) {
      expect(entry.user_id).toBe('user-1');
    }
  });

  it('should combine multiple filters', () => {
    const entries = generateEntries(30);
    const startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const result = queryAuditLog(
      entries,
      { startDate, endDate: now, actionType: 'menu.price_change', outletId: 'outlet-a' },
      now,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const entry of result.data.entries) {
      expect(entry.action_type).toBe('menu.price_change');
      expect(entry.outlet_id).toBe('outlet-a');
    }
  });

  it('should return empty result when no entries match', () => {
    const entries = generateEntries(10);
    const startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const result = queryAuditLog(
      entries,
      { startDate, endDate: now, actionType: 'nonexistent' },
      now,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.entries).toHaveLength(0);
    expect(result.data.totalEntries).toBe(0);
    expect(result.data.totalPages).toBe(1);
  });

  it('should default to page 1 when page not specified', () => {
    const entries = generateEntries(10);
    const result = queryAuditLog(entries, {}, now);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.page).toBe(1);
  });
});
