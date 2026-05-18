/**
 * Delete-with-history protection — Property 18.
 *
 * Prevents deletion of a Menu_Item that has associated Transaction history.
 * If transactionCount > 0, deletion is rejected with MENU_HAS_TX_HISTORY.
 * If transactionCount === 0, deletion is allowed.
 *
 * Validates: Requirements 5.8
 */

// ─── Result Type ─────────────────────────────────────────────────────────────

export type Result<T, E extends string> = { ok: true; value: T } | { ok: false; error: E };

// ─── Function ────────────────────────────────────────────────────────────────

/**
 * Determine whether a menu item can be deleted based on its transaction history.
 *
 * @param _menuItemId - The ID of the menu item to check (used for context/tracing).
 * @param transactionCount - Number of historical transactions referencing this menu item.
 * @returns Result<true, 'MENU_HAS_TX_HISTORY'> — success if deletable, error otherwise.
 */
export function canDeleteMenuItem(
  _menuItemId: string,
  transactionCount: number,
): Result<true, 'MENU_HAS_TX_HISTORY'> {
  if (transactionCount > 0) {
    return { ok: false, error: 'MENU_HAS_TX_HISTORY' };
  }
  return { ok: true, value: true };
}
