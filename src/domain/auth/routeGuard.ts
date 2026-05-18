/**
 * Route guard for Yuzztea POS SaaS.
 *
 * Determines whether a user can access a given route based on their session state.
 * Returns either an allow decision or a redirect to the appropriate page.
 *
 * Decision table:
 * - session = null AND route in publicRoutes → allow
 * - session = null AND route not in publicRoutes → redirect(/login)
 * - session != null AND role != owner AND outletIds = [] → redirect(/no-outlet)
 * - session != null AND role = cashier AND route in adminRoutes → redirect(/pos)
 * - Otherwise → allow
 *
 * Pure function — no side effects.
 *
 * @module domain/auth/routeGuard
 * @see Requirements 1.5, 2.5, 2.6, 14.5
 */

import type { Role } from './authorize';

/**
 * Routes accessible without authentication.
 */
export const publicRoutes: readonly string[] = ['/', '/login'];

/**
 * Routes restricted to Owner and Outlet_Manager (admin/management console).
 */
export const adminRoutes: readonly string[] = [
  '/admin/outlets',
  '/admin/users',
  '/admin/menu',
  '/admin/inventory',
  '/admin/reports',
  '/admin/audit',
];

/**
 * Minimal session info needed for route guard decisions.
 */
export interface RouteGuardSession {
  role: Role;
  outletIds: string[];
}

/**
 * Result of a route guard evaluation.
 */
export type RouteGuardResult = { kind: 'allow' } | { kind: 'redirect'; to: string };

/**
 * Evaluates whether a user can access the given route based on their session.
 *
 * @param route - The route path being accessed
 * @param session - The current user session, or null if unauthenticated
 * @returns An allow or redirect decision
 */
export function routeGuard(route: string, session: RouteGuardSession | null): RouteGuardResult {
  // Unauthenticated user
  if (session === null) {
    if (publicRoutes.includes(route)) {
      return { kind: 'allow' };
    }
    return { kind: 'redirect', to: '/login' };
  }

  // Authenticated user without outlet assignments (non-owner)
  if (session.role !== 'owner' && session.outletIds.length === 0) {
    return { kind: 'redirect', to: '/no-outlet' };
  }

  // Cashier trying to access admin routes
  if (session.role === 'cashier' && adminRoutes.includes(route)) {
    return { kind: 'redirect', to: '/pos' };
  }

  // All other cases: allow
  return { kind: 'allow' };
}
