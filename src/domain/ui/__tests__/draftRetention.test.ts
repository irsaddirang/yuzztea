import { describe, it, expect, beforeEach } from 'vitest';

import {
  mergeDraftOnResize,
  useDraftStore,
  useDraftPersistence,
  type Breakpoint,
  type BreakpointTransition,
  type FormDraft,
} from '../draftRetention';

describe('mergeDraftOnResize', () => {
  it('preserves all fields when transitioning mobile → tablet', () => {
    const draft: FormDraft = { name: 'Outlet A', code: 'OA01', city: 'Jakarta' };
    const transition: BreakpointTransition = { from: 'mobile', to: 'tablet' };

    const result = mergeDraftOnResize(draft, transition);

    expect(result).toEqual(draft);
  });

  it('preserves all fields when transitioning tablet → desktop', () => {
    const draft: FormDraft = { price: 15000, category: 'Minuman', active: true };
    const transition: BreakpointTransition = { from: 'tablet', to: 'desktop' };

    const result = mergeDraftOnResize(draft, transition);

    expect(result).toEqual(draft);
  });

  it('preserves all fields when transitioning desktop → mobile', () => {
    const draft: FormDraft = { email: 'test@yuzztea.com', role: 'cashier', outlets: ['a', 'b'] };
    const transition: BreakpointTransition = { from: 'desktop', to: 'mobile' };

    const result = mergeDraftOnResize(draft, transition);

    expect(result).toEqual(draft);
  });

  it('returns a new object reference (immutability)', () => {
    const draft: FormDraft = { name: 'Test' };
    const transition: BreakpointTransition = { from: 'mobile', to: 'desktop' };

    const result = mergeDraftOnResize(draft, transition);

    expect(result).not.toBe(draft);
    expect(result).toEqual(draft);
  });

  it('handles empty draft', () => {
    const draft: FormDraft = {};
    const transition: BreakpointTransition = { from: 'tablet', to: 'mobile' };

    const result = mergeDraftOnResize(draft, transition);

    expect(result).toEqual({});
  });

  it('preserves null and undefined field values', () => {
    const draft: FormDraft = { name: 'Test', description: null, image: undefined };
    const transition: BreakpointTransition = { from: 'mobile', to: 'tablet' };

    const result = mergeDraftOnResize(draft, transition);

    expect(result).toEqual(draft);
  });

  it('preserves nested objects and arrays', () => {
    const draft: FormDraft = {
      ingredients: [
        { id: '1', qty: 5 },
        { id: '2', qty: 10 },
      ],
      metadata: { createdBy: 'user1', tags: ['hot', 'new'] },
    };
    const transition: BreakpointTransition = { from: 'desktop', to: 'tablet' };

    const result = mergeDraftOnResize(draft, transition);

    expect(result).toEqual(draft);
  });

  it('is idempotent across multiple transitions', () => {
    const draft: FormDraft = { name: 'Es Teh', price: 8000 };
    const transitions: BreakpointTransition[] = [
      { from: 'mobile', to: 'tablet' },
      { from: 'tablet', to: 'desktop' },
      { from: 'desktop', to: 'mobile' },
    ];

    let current = draft;
    for (const t of transitions) {
      current = mergeDraftOnResize(current, t);
    }

    expect(current).toEqual(draft);
  });
});

describe('useDraftStore', () => {
  beforeEach(() => {
    useDraftStore.getState().clearAll();
  });

  it('starts with empty drafts', () => {
    expect(useDraftStore.getState().drafts).toEqual({});
  });

  it('setDraft stores a draft keyed by route', () => {
    const { setDraft } = useDraftStore.getState();
    setDraft('/admin/menu', { name: 'Es Teh Lemon', price: 12000 });

    expect(useDraftStore.getState().drafts['/admin/menu']).toEqual({
      name: 'Es Teh Lemon',
      price: 12000,
    });
  });

  it('getDraft retrieves stored draft', () => {
    const { setDraft, getDraft } = useDraftStore.getState();
    setDraft('/admin/outlets', { code: 'YZT01' });

    expect(getDraft('/admin/outlets')).toEqual({ code: 'YZT01' });
  });

  it('getDraft returns undefined for non-existent route', () => {
    const { getDraft } = useDraftStore.getState();

    expect(getDraft('/nonexistent')).toBeUndefined();
  });

  it('clearDraft removes a specific route draft', () => {
    const { setDraft, clearDraft, getDraft } = useDraftStore.getState();
    setDraft('/admin/menu', { name: 'Test' });
    setDraft('/admin/outlets', { code: 'ABC' });

    clearDraft('/admin/menu');

    expect(getDraft('/admin/menu')).toBeUndefined();
    expect(getDraft('/admin/outlets')).toEqual({ code: 'ABC' });
  });

  it('clearAll removes all drafts', () => {
    const { setDraft, clearAll } = useDraftStore.getState();
    setDraft('/admin/menu', { name: 'A' });
    setDraft('/admin/outlets', { code: 'B' });

    clearAll();

    expect(useDraftStore.getState().drafts).toEqual({});
  });

  it('setDraft overwrites existing draft for same route', () => {
    const { setDraft, getDraft } = useDraftStore.getState();
    setDraft('/pos', { qty: 1 });
    setDraft('/pos', { qty: 5, note: 'extra ice' });

    expect(getDraft('/pos')).toEqual({ qty: 5, note: 'extra ice' });
  });

  it('supports multiple independent route drafts', () => {
    const { setDraft, getDraft } = useDraftStore.getState();
    setDraft('/admin/menu', { name: 'Menu A' });
    setDraft('/admin/users', { email: 'user@test.com' });
    setDraft('/admin/inventory', { qty: 100 });

    expect(getDraft('/admin/menu')).toEqual({ name: 'Menu A' });
    expect(getDraft('/admin/users')).toEqual({ email: 'user@test.com' });
    expect(getDraft('/admin/inventory')).toEqual({ qty: 100 });
  });
});
