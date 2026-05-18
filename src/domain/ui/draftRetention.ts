/**
 * Draft retention utilities for Yuzztea POS SaaS.
 *
 * Ensures form field values are preserved when the viewport crosses
 * breakpoint boundaries (mobile ↔ tablet ↔ desktop) during an active session.
 * This prevents data loss when the layout re-renders due to responsive changes.
 *
 * The pure function `mergeDraftOnResize` guarantees that all non-submit fields
 * remain intact across breakpoint transitions. The Zustand hook `useDraftPersistence`
 * provides a convenient store keyed by route for component integration.
 *
 * Property 25: Form draft retention across breakpoints
 * Pure functions — no side effects (except the Zustand store helper).
 *
 * @module domain/ui/draftRetention
 * @see Requirements 12.7
 */

import { create } from 'zustand';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Supported responsive breakpoints. */
export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

/** Describes a breakpoint transition event. */
export interface BreakpointTransition {
  from: Breakpoint;
  to: Breakpoint;
}

/**
 * A form draft is a record of field names to their current values.
 * Values can be any serializable type (string, number, boolean, array, object, null).
 */
export type FormDraft = Record<string, unknown>;

// ─── Pure Function ───────────────────────────────────────────────────────────

/**
 * Merges a previous form draft across a breakpoint resize event,
 * preserving all field values unchanged.
 *
 * This function guarantees that for any draft and any sequence of breakpoint
 * transitions, the output draft is identical to the input draft as long as
 * the user has not submitted or reset the form.
 *
 * The breakpoint transition information is accepted for potential future use
 * (e.g., layout-specific field transformations) but currently the merge
 * strategy is identity — all fields are preserved regardless of direction.
 *
 * @param prevDraft - The form draft state before the resize event
 * @param _breakpointFromTo - The breakpoint transition (from → to)
 * @returns A new draft object with all field values preserved
 */
export function mergeDraftOnResize(
  prevDraft: FormDraft,
  _breakpointFromTo: BreakpointTransition,
): FormDraft {
  // Identity merge: all non-submit fields are preserved across breakpoints.
  // We return a shallow copy to maintain immutability guarantees.
  return { ...prevDraft };
}

// ─── Zustand Store ───────────────────────────────────────────────────────────

/** Shape of the draft persistence store state. */
export interface DraftPersistenceState {
  /** Drafts keyed by route path. */
  drafts: Record<string, FormDraft>;

  /** Save or update a draft for a given route. */
  setDraft: (routeKey: string, draft: FormDraft) => void;

  /** Retrieve the draft for a given route, or undefined if none exists. */
  getDraft: (routeKey: string) => FormDraft | undefined;

  /** Clear the draft for a given route (e.g., after form submit or reset). */
  clearDraft: (routeKey: string) => void;

  /** Clear all stored drafts (e.g., on logout). */
  clearAll: () => void;
}

/**
 * Zustand store for persisting form drafts across breakpoint changes.
 *
 * Drafts are keyed by route path so each page/form maintains its own
 * independent draft state. The store is used by the `useDraftPersistence`
 * hook to provide a simple API for components.
 */
export const useDraftStore = create<DraftPersistenceState>((set, get) => ({
  drafts: {},

  setDraft: (routeKey: string, draft: FormDraft) => {
    set((state) => ({
      drafts: { ...state.drafts, [routeKey]: draft },
    }));
  },

  getDraft: (routeKey: string) => {
    return get().drafts[routeKey];
  },

  clearDraft: (routeKey: string) => {
    set((state) => {
      const { [routeKey]: _, ...rest } = state.drafts;
      return { drafts: rest };
    });
  },

  clearAll: () => {
    set({ drafts: {} });
  },
}));

// ─── Hook Helper ─────────────────────────────────────────────────────────────

/** Return type of the `useDraftPersistence` hook. */
export interface DraftPersistenceHook {
  /** Current draft for this route, or undefined if none saved. */
  draft: FormDraft | undefined;

  /** Save the current form state as a draft. */
  saveDraft: (draft: FormDraft) => void;

  /** Clear the draft (call on successful submit or explicit reset). */
  clearDraft: () => void;

  /** Merge draft across a breakpoint change, preserving all fields. */
  onBreakpointChange: (transition: BreakpointTransition) => void;
}

/**
 * Hook that provides draft persistence scoped to a specific route.
 *
 * Usage:
 * ```ts
 * const { draft, saveDraft, clearDraft, onBreakpointChange } = useDraftPersistence('/admin/menu');
 * ```
 *
 * - Call `saveDraft(formValues)` on every form change to persist the draft.
 * - Call `onBreakpointChange(transition)` when viewport crosses a breakpoint
 *   to ensure the draft is preserved through the layout change.
 * - Call `clearDraft()` after successful form submission or user-initiated reset.
 *
 * @param routeKey - The route path used as the storage key for this draft
 * @returns Draft persistence utilities scoped to the given route
 */
export function useDraftPersistence(routeKey: string): DraftPersistenceHook {
  const draft = useDraftStore((state) => state.drafts[routeKey]);
  const setDraft = useDraftStore((state) => state.setDraft);
  const clearDraftFn = useDraftStore((state) => state.clearDraft);

  const saveDraft = (newDraft: FormDraft) => {
    setDraft(routeKey, newDraft);
  };

  const clearDraft = () => {
    clearDraftFn(routeKey);
  };

  const onBreakpointChange = (transition: BreakpointTransition) => {
    const currentDraft = useDraftStore.getState().drafts[routeKey];
    if (currentDraft) {
      const merged = mergeDraftOnResize(currentDraft, transition);
      setDraft(routeKey, merged);
    }
  };

  return { draft, saveDraft, clearDraft, onBreakpointChange };
}
