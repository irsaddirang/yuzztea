/**
 * Authorization predicate for Yuzztea POS SaaS.
 *
 * Evaluates whether a user with a given role and outlet assignments
 * is authorized to access a resource scope at a specific outlet.
 *
 * Decision table:
 * - Owner + any scope (pos, management, audit) → true
 * - Outlet_Manager + (pos | management) + requestedOutletId ∈ userOutletIds → true
 * - Cashier + pos + requestedOutletId ∈ userOutletIds → true
 * - All other combinations → false
 *
 * Pure function — no side effects.
 *
 * @module domain/auth/authorize
 * @see Requirements 2.2, 2.3, 2.4, 2.5, 4.2, 4.5, 5.4, 14.5
 */

/**
 * The three roles supported by the Authorization_System.
 */
export type Role = 'owner' | 'outlet_manager' | 'cashier';

/**
 * Resource scopes that map to application areas:
 * - `pos`: POS_Module (transaction recording, menu display)
 * - `management`: Management_Console (menu, stock, users, outlets, reports)
 * - `audit`: Audit log viewing (Owner only)
 */
export type ResourceScope = 'pos' | 'management' | 'audit';

/**
 * Input parameters for the authorization predicate.
 */
export interface AuthorizeParams {
  /** The user's role */
  role: Role;
  /** List of outlet IDs the user is assigned to */
  userOutletIds: string[];
  /** The resource scope being accessed */
  scope: ResourceScope;
  /** The outlet ID being requested for access */
  requestedOutletId: string;
}

/**
 * Determines whether a user is authorized to access a given resource scope
 * at a specific outlet.
 *
 * @param params - Authorization parameters
 * @returns `true` if access is granted, `false` otherwise
 */
export function authorize(params: AuthorizeParams): boolean {
  const { role, userOutletIds, scope, requestedOutletId } = params;

  switch (role) {
    case 'owner':
      // Owner has access to all scopes across all outlets
      return true;

    case 'outlet_manager':
      // Manager can access pos and management scopes, but only for assigned outlets
      if (scope === 'pos' || scope === 'management') {
        return userOutletIds.includes(requestedOutletId);
      }
      // Manager cannot access audit scope
      return false;

    case 'cashier':
      // Cashier can only access pos scope, and only for assigned outlets
      if (scope === 'pos') {
        return userOutletIds.includes(requestedOutletId);
      }
      // Cashier cannot access management or audit scopes
      return false;

    default:
      return false;
  }
}
