import { describe, it, expect } from 'vitest';

import { routeGuard, publicRoutes, adminRoutes, type RouteGuardSession } from '../routeGuard';

describe('routeGuard', () => {
  describe('unauthenticated (session = null)', () => {
    it('allows access to public routes', () => {
      for (const route of publicRoutes) {
        expect(routeGuard(route, null)).toEqual({ kind: 'allow' });
      }
    });

    it('redirects to /login for non-public routes', () => {
      const protectedRoutes = ['/pos', '/admin/outlets', '/admin/menu', '/no-outlet'];
      for (const route of protectedRoutes) {
        expect(routeGuard(route, null)).toEqual({ kind: 'redirect', to: '/login' });
      }
    });
  });

  describe('authenticated without outlet assignments (non-owner)', () => {
    it('redirects outlet_manager with no outlets to /no-outlet', () => {
      const session: RouteGuardSession = { role: 'outlet_manager', outletIds: [] };
      expect(routeGuard('/pos', session)).toEqual({ kind: 'redirect', to: '/no-outlet' });
      expect(routeGuard('/admin/menu', session)).toEqual({ kind: 'redirect', to: '/no-outlet' });
    });

    it('redirects cashier with no outlets to /no-outlet', () => {
      const session: RouteGuardSession = { role: 'cashier', outletIds: [] };
      expect(routeGuard('/pos', session)).toEqual({ kind: 'redirect', to: '/no-outlet' });
    });

    it('allows owner with no outlets (owner always has access)', () => {
      const session: RouteGuardSession = { role: 'owner', outletIds: [] };
      expect(routeGuard('/pos', session)).toEqual({ kind: 'allow' });
      expect(routeGuard('/admin/outlets', session)).toEqual({ kind: 'allow' });
    });
  });

  describe('cashier accessing admin routes', () => {
    it('redirects cashier from admin routes to /pos', () => {
      const session: RouteGuardSession = { role: 'cashier', outletIds: ['outlet-1'] };
      for (const route of adminRoutes) {
        expect(routeGuard(route, session)).toEqual({ kind: 'redirect', to: '/pos' });
      }
    });

    it('allows cashier to access /pos', () => {
      const session: RouteGuardSession = { role: 'cashier', outletIds: ['outlet-1'] };
      expect(routeGuard('/pos', session)).toEqual({ kind: 'allow' });
    });
  });

  describe('owner and outlet_manager access', () => {
    it('allows owner to access all routes', () => {
      const session: RouteGuardSession = { role: 'owner', outletIds: ['outlet-1'] };
      const allRoutes = ['/pos', ...adminRoutes, '/no-outlet'];
      for (const route of allRoutes) {
        expect(routeGuard(route, session)).toEqual({ kind: 'allow' });
      }
    });

    it('allows outlet_manager to access admin routes', () => {
      const session: RouteGuardSession = { role: 'outlet_manager', outletIds: ['outlet-1'] };
      for (const route of adminRoutes) {
        expect(routeGuard(route, session)).toEqual({ kind: 'allow' });
      }
    });

    it('allows outlet_manager to access /pos', () => {
      const session: RouteGuardSession = { role: 'outlet_manager', outletIds: ['outlet-1'] };
      expect(routeGuard('/pos', session)).toEqual({ kind: 'allow' });
    });
  });
});
