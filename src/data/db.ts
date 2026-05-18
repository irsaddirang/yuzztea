import Dexie, { type EntityTable } from 'dexie';

// --- Store interfaces ---

export interface CachedMenuItem {
  id: string;
  outletId: string;
  menuItemId: string;
  name: string;
  category: string;
  basePrice: number;
  priceOverride?: number | null;
  activeOverride?: boolean | null;
  description?: string;
  imageUrl?: string | null;
  unit: string;
  active: boolean;
  createdAt: string; // ISO 8601
}

export interface CachedOutlet {
  id: string;
  outletId: string;
  name: string;
  code: string;
  address: string;
  city: string;
  openTime: string;
  closeTime: string;
  active: boolean;
  createdAt: string; // ISO 8601
}

export interface CachedRecipe {
  id: string;
  outletId: string;
  menuItemId: string;
  ingredients: { rawMaterialId: string; qtyPerUnit: number }[];
  createdAt: string; // ISO 8601
}

export interface CachedStock {
  id: string;
  outletId: string;
  rawMaterialId: string;
  quantity: number;
  minQuantity: number;
  unit: string;
  createdAt: string; // ISO 8601
}

export interface PendingSyncTransaction {
  id: string;
  outletId: string;
  payload: unknown;
  retryCount: number;
  createdAt: string; // ISO 8601
}

export interface FailedSyncTransaction {
  id: string;
  outletId: string;
  payload: unknown;
  retryCount: number;
  failedAt: string; // ISO 8601
  createdAt: string; // ISO 8601
}

export interface Draft {
  id: string;
  routeKey: string;
  outletId?: string;
  data: unknown;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

// --- Database class ---

class YuzzteaDB extends Dexie {
  cacheMenuItems!: EntityTable<CachedMenuItem, 'id'>;
  cacheOutlets!: EntityTable<CachedOutlet, 'id'>;
  cacheRecipes!: EntityTable<CachedRecipe, 'id'>;
  cacheStock!: EntityTable<CachedStock, 'id'>;
  pendingSync!: EntityTable<PendingSyncTransaction, 'id'>;
  failedSync!: EntityTable<FailedSyncTransaction, 'id'>;
  drafts!: EntityTable<Draft, 'id'>;

  constructor() {
    super('yuzztea-pos');

    this.version(1).stores({
      cache_menu_items: 'id, outletId, menuItemId, createdAt',
      cache_outlets: 'id, outletId, createdAt',
      cache_recipes: 'id, outletId, menuItemId, createdAt',
      cache_stock: 'id, outletId, rawMaterialId, createdAt',
      pending_sync: 'id, outletId, createdAt',
      failed_sync: 'id, outletId, createdAt',
      drafts: 'id, routeKey, outletId, createdAt',
    });

    // Map table names to camelCase properties
    this.cacheMenuItems = this.table('cache_menu_items');
    this.cacheOutlets = this.table('cache_outlets');
    this.cacheRecipes = this.table('cache_recipes');
    this.cacheStock = this.table('cache_stock');
    this.pendingSync = this.table('pending_sync');
    this.failedSync = this.table('failed_sync');
    this.drafts = this.table('drafts');
  }
}

// Singleton instance
export const db = new YuzzteaDB();
