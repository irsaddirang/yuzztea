/**
 * Menu Visibility — pure functions for determining menu item visibility and
 * effective pricing in the POS module.
 *
 * A menu item is visible in POS when:
 * 1. The outlet is active
 * 2. The item's effective active status is true (override takes precedence over global)
 * 3. The item belongs to the same organization as the outlet
 *
 * Effective price uses the outlet-specific override if defined, otherwise the
 * global base_price.
 *
 * effectiveMenuList filters visible items, applies effective prices, and sorts
 * by category (A-Z locale id-ID) then by name (A-Z locale id-ID).
 *
 * Validates: Requirements 3.4, 5.3, 5.5
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type MenuItem = {
  id: string;
  organizationId: string;
  name: string;
  category: string;
  basePrice: number; // integer Rupiah
  active: boolean;
};

export type MenuItemOutletOverride = {
  menuItemId: string;
  outletId: string;
  priceOverride?: number | null; // integer Rupiah, nullable
  activeOverride?: boolean | null; // nullable — null means use global
};

export type Outlet = {
  id: string;
  organizationId: string;
  active: boolean;
};

export type EffectiveMenuItem = {
  id: string;
  name: string;
  category: string;
  price: number; // effective price (integer Rupiah)
};

// ─── Functions ───────────────────────────────────────────────────────────────

/**
 * Determines whether a menu item should be visible in the POS for a given outlet.
 *
 * Visibility requires ALL of:
 * - outlet.active = true
 * - effective active status = true (override?.activeOverride if defined, else menuItem.active)
 * - menuItem.organizationId = outlet.organizationId
 *
 * @param menuItem - The global menu item definition.
 * @param override - Optional outlet-specific override (may be undefined/null).
 * @param outlet - The outlet context.
 * @returns true if the item should be shown in POS.
 */
export function isVisibleInPos(
  menuItem: MenuItem,
  override: MenuItemOutletOverride | undefined | null,
  outlet: Outlet,
): boolean {
  if (!outlet.active) return false;
  if (menuItem.organizationId !== outlet.organizationId) return false;

  const effectiveActive =
    override?.activeOverride != null ? override.activeOverride : menuItem.active;

  return effectiveActive;
}

/**
 * Returns the effective price for a menu item at a specific outlet.
 *
 * Uses override.priceOverride if defined (not null/undefined), otherwise
 * falls back to menuItem.basePrice.
 *
 * @param menuItem - The global menu item definition.
 * @param override - Optional outlet-specific override.
 * @returns Effective price as integer Rupiah.
 */
export function effectivePrice(
  menuItem: MenuItem,
  override?: MenuItemOutletOverride | null,
): number {
  if (override?.priceOverride != null) {
    return override.priceOverride;
  }
  return menuItem.basePrice;
}

/**
 * Produces the effective menu list for a POS outlet: filters to visible items,
 * applies effective prices, and sorts by category (A-Z) then name (A-Z) using
 * locale id-ID for consistent Indonesian alphabetical ordering.
 *
 * @param menus - All menu items in the organization.
 * @param overrides - All outlet-specific overrides (may include overrides for other outlets).
 * @param outlet - The target outlet.
 * @returns Sorted list of effective menu items visible in POS.
 */
export function effectiveMenuList(
  menus: MenuItem[],
  overrides: MenuItemOutletOverride[],
  outlet: Outlet,
): EffectiveMenuItem[] {
  const idIdCollator = new Intl.Collator('id-ID');

  const result: EffectiveMenuItem[] = [];

  for (const menu of menus) {
    const override = overrides.find((o) => o.menuItemId === menu.id && o.outletId === outlet.id);

    if (!isVisibleInPos(menu, override, outlet)) continue;

    result.push({
      id: menu.id,
      name: menu.name,
      category: menu.category,
      price: effectivePrice(menu, override),
    });
  }

  result.sort((a, b) => {
    const catCmp = idIdCollator.compare(a.category, b.category);
    if (catCmp !== 0) return catCmp;
    return idIdCollator.compare(a.name, b.name);
  });

  return result;
}
