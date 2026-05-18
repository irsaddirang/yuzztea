import { describe, it, expect } from 'vitest';

import {
  isVisibleInPos,
  effectivePrice,
  effectiveMenuList,
  type MenuItem,
  type MenuItemOutletOverride,
  type Outlet,
} from '../menuVisibility';

// ─── Test Data ───────────────────────────────────────────────────────────────

const orgId = 'org-yuzztea-001';

const activeOutlet: Outlet = {
  id: 'outlet-001',
  organizationId: orgId,
  active: true,
};

const inactiveOutlet: Outlet = {
  id: 'outlet-002',
  organizationId: orgId,
  active: false,
};

const otherOrgOutlet: Outlet = {
  id: 'outlet-003',
  organizationId: 'org-other',
  active: true,
};

const activeMenuItem: MenuItem = {
  id: 'menu-001',
  organizationId: orgId,
  name: 'Es Teh Original',
  category: 'Minuman Teh',
  basePrice: 5000,
  active: true,
};

const inactiveMenuItem: MenuItem = {
  id: 'menu-002',
  organizationId: orgId,
  name: 'Es Teh Lemon',
  category: 'Minuman Teh',
  basePrice: 7000,
  active: false,
};

// ─── isVisibleInPos ──────────────────────────────────────────────────────────

describe('isVisibleInPos', () => {
  it('returns true when outlet active, item active, same org, no override', () => {
    expect(isVisibleInPos(activeMenuItem, undefined, activeOutlet)).toBe(true);
  });

  it('returns true when outlet active, item active, same org, override is null', () => {
    expect(isVisibleInPos(activeMenuItem, null, activeOutlet)).toBe(true);
  });

  it('returns false when outlet is inactive', () => {
    expect(isVisibleInPos(activeMenuItem, undefined, inactiveOutlet)).toBe(false);
  });

  it('returns false when item belongs to different organization', () => {
    expect(isVisibleInPos(activeMenuItem, undefined, otherOrgOutlet)).toBe(false);
  });

  it('returns false when item is globally inactive and no override', () => {
    expect(isVisibleInPos(inactiveMenuItem, undefined, activeOutlet)).toBe(false);
  });

  it('returns true when item is globally inactive but override sets active to true', () => {
    const override: MenuItemOutletOverride = {
      menuItemId: inactiveMenuItem.id,
      outletId: activeOutlet.id,
      activeOverride: true,
    };
    expect(isVisibleInPos(inactiveMenuItem, override, activeOutlet)).toBe(true);
  });

  it('returns false when item is globally active but override sets active to false', () => {
    const override: MenuItemOutletOverride = {
      menuItemId: activeMenuItem.id,
      outletId: activeOutlet.id,
      activeOverride: false,
    };
    expect(isVisibleInPos(activeMenuItem, override, activeOutlet)).toBe(false);
  });

  it('uses global active when override.activeOverride is null', () => {
    const override: MenuItemOutletOverride = {
      menuItemId: activeMenuItem.id,
      outletId: activeOutlet.id,
      activeOverride: null,
    };
    expect(isVisibleInPos(activeMenuItem, override, activeOutlet)).toBe(true);
    expect(isVisibleInPos(inactiveMenuItem, override, activeOutlet)).toBe(false);
  });

  it('uses global active when override.activeOverride is undefined', () => {
    const override: MenuItemOutletOverride = {
      menuItemId: activeMenuItem.id,
      outletId: activeOutlet.id,
    };
    expect(isVisibleInPos(activeMenuItem, override, activeOutlet)).toBe(true);
  });
});

// ─── effectivePrice ──────────────────────────────────────────────────────────

describe('effectivePrice', () => {
  it('returns basePrice when no override', () => {
    expect(effectivePrice(activeMenuItem)).toBe(5000);
  });

  it('returns basePrice when override is null', () => {
    expect(effectivePrice(activeMenuItem, null)).toBe(5000);
  });

  it('returns basePrice when override.priceOverride is null', () => {
    const override: MenuItemOutletOverride = {
      menuItemId: activeMenuItem.id,
      outletId: activeOutlet.id,
      priceOverride: null,
    };
    expect(effectivePrice(activeMenuItem, override)).toBe(5000);
  });

  it('returns basePrice when override.priceOverride is undefined', () => {
    const override: MenuItemOutletOverride = {
      menuItemId: activeMenuItem.id,
      outletId: activeOutlet.id,
    };
    expect(effectivePrice(activeMenuItem, override)).toBe(5000);
  });

  it('returns priceOverride when defined', () => {
    const override: MenuItemOutletOverride = {
      menuItemId: activeMenuItem.id,
      outletId: activeOutlet.id,
      priceOverride: 6000,
    };
    expect(effectivePrice(activeMenuItem, override)).toBe(6000);
  });

  it('returns priceOverride of 0 when explicitly set to 0', () => {
    const override: MenuItemOutletOverride = {
      menuItemId: activeMenuItem.id,
      outletId: activeOutlet.id,
      priceOverride: 0,
    };
    expect(effectivePrice(activeMenuItem, override)).toBe(0);
  });
});

// ─── effectiveMenuList ───────────────────────────────────────────────────────

describe('effectiveMenuList', () => {
  const menus: MenuItem[] = [
    {
      id: 'm1',
      organizationId: orgId,
      name: 'Zebra Tea',
      category: 'Spesial',
      basePrice: 12000,
      active: true,
    },
    {
      id: 'm2',
      organizationId: orgId,
      name: 'Es Teh Original',
      category: 'Minuman Teh',
      basePrice: 5000,
      active: true,
    },
    {
      id: 'm3',
      organizationId: orgId,
      name: 'Es Teh Lemon',
      category: 'Minuman Teh',
      basePrice: 7000,
      active: true,
    },
    {
      id: 'm4',
      organizationId: orgId,
      name: 'Roti Bakar',
      category: 'Makanan',
      basePrice: 10000,
      active: true,
    },
    {
      id: 'm5',
      organizationId: orgId,
      name: 'Ayam Goreng',
      category: 'Makanan',
      basePrice: 15000,
      active: false,
    },
  ];

  it('filters out inactive items', () => {
    const result = effectiveMenuList(menus, [], activeOutlet);
    const ids = result.map((r) => r.id);
    expect(ids).not.toContain('m5'); // globally inactive
  });

  it('sorts by category A-Z then name A-Z (locale id-ID)', () => {
    const result = effectiveMenuList(menus, [], activeOutlet);
    // Expected order: Makanan (Roti Bakar), Minuman Teh (Es Teh Lemon, Es Teh Original), Spesial (Zebra Tea)
    expect(result.map((r) => r.name)).toEqual([
      'Roti Bakar',
      'Es Teh Lemon',
      'Es Teh Original',
      'Zebra Tea',
    ]);
  });

  it('applies price override for specific outlet', () => {
    const overrides: MenuItemOutletOverride[] = [
      { menuItemId: 'm2', outletId: activeOutlet.id, priceOverride: 6000 },
    ];
    const result = effectiveMenuList(menus, overrides, activeOutlet);
    const esTehOriginal = result.find((r) => r.id === 'm2');
    expect(esTehOriginal?.price).toBe(6000);
  });

  it('ignores overrides for other outlets', () => {
    const overrides: MenuItemOutletOverride[] = [
      { menuItemId: 'm2', outletId: 'other-outlet', priceOverride: 9999 },
    ];
    const result = effectiveMenuList(menus, overrides, activeOutlet);
    const esTehOriginal = result.find((r) => r.id === 'm2');
    expect(esTehOriginal?.price).toBe(5000); // uses basePrice
  });

  it('includes globally inactive item when override activates it', () => {
    const overrides: MenuItemOutletOverride[] = [
      { menuItemId: 'm5', outletId: activeOutlet.id, activeOverride: true },
    ];
    const result = effectiveMenuList(menus, overrides, activeOutlet);
    const ids = result.map((r) => r.id);
    expect(ids).toContain('m5');
  });

  it('excludes globally active item when override deactivates it', () => {
    const overrides: MenuItemOutletOverride[] = [
      { menuItemId: 'm2', outletId: activeOutlet.id, activeOverride: false },
    ];
    const result = effectiveMenuList(menus, overrides, activeOutlet);
    const ids = result.map((r) => r.id);
    expect(ids).not.toContain('m2');
  });

  it('returns empty list when outlet is inactive', () => {
    const result = effectiveMenuList(menus, [], inactiveOutlet);
    expect(result).toEqual([]);
  });

  it('returns empty list for empty menus', () => {
    const result = effectiveMenuList([], [], activeOutlet);
    expect(result).toEqual([]);
  });

  it('filters out items from different organization', () => {
    const mixedMenus: MenuItem[] = [
      ...menus,
      {
        id: 'm-other',
        organizationId: 'org-other',
        name: 'Other Item',
        category: 'A',
        basePrice: 1000,
        active: true,
      },
    ];
    const result = effectiveMenuList(mixedMenus, [], activeOutlet);
    const ids = result.map((r) => r.id);
    expect(ids).not.toContain('m-other');
  });
});
