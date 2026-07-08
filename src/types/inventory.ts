export type InventoryCategory =
  | 'protein'
  | 'vegetable'
  | 'carbohydrate'
  | 'dairy'
  | 'sauce'
  | 'spices'
  | 'oils'
  | 'dry_goods'
  | 'packaging'
  | 'cleaning'
  | 'beverage'
  | 'finished_product'
  | 'other';

export type InventoryUnit = 'kg' | 'g' | 'l' | 'ml' | 'piece' | 'box' | 'tray' | 'carton' | 'bag' | 'bottle' | 'can' | 'set' | 'dozen';

export type InventoryStatus = 'healthy' | 'low' | 'critical' | 'out';

export type InventoryMovementType =
  | 'purchase'
  | 'customer_return'
  | 'warehouse_transfer_in'
  | 'production_in'
  | 'production_out'
  | 'sale'
  | 'waste'
  | 'sample'
  | 'internal_consumption'
  | 'warehouse_transfer_out';

export type InventoryCountType = 'daily' | 'weekly' | 'monthly' | 'spot';

export type InventoryTransferStatus = 'draft' | 'requested' | 'approved' | 'in_transit' | 'received' | 'cancelled';

export type InventoryBatchStatus = 'available' | 'reserved' | 'consumed' | 'expired' | 'damaged';

export interface InventoryWarehouse {
  id: string;
  brand_id: string;
  warehouse_code: string;
  name: string;
  warehouse_type: string;
  responsible_user_id?: string | null;
  location: string;
  capacity_qty?: number | null;
  status: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface InventoryBatch {
  id: string;
  brand_id: string;
  warehouse_id: string;
  item_id: string;
  batch_no: string;
  production_date?: string | null;
  expiry_date?: string | null;
  received_at: string;
  quantity_on_hand: number;
  reserved_qty: number;
  unit_cost: number;
  status: InventoryBatchStatus;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface InventoryMovement {
  id: string;
  brand_id: string;
  item_id: string;
  batch_id?: string | null;
  warehouse_id?: string | null;
  movement_type: InventoryMovementType;
  quantity: number;
  unit_cost?: number | null;
  reference_type?: string | null;
  reference_id?: string | null;
  reason?: string | null;
  user_id?: string | null;
  occurred_at: string;
  created_at: string;
  updated_at: string;
}

export interface InventoryCount {
  id: string;
  brand_id: string;
  warehouse_id: string;
  count_no: string;
  count_type: InventoryCountType;
  count_date: string;
  counted_by?: string | null;
  approved_by?: string | null;
  status: string;
  book_qty: number;
  physical_qty: number;
  variance_qty: number;
  variance_ratio: number;
  variance_reason: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface InventoryTransfer {
  id: string;
  brand_id: string;
  transfer_no: string;
  from_warehouse_id: string;
  to_warehouse_id: string;
  status: InventoryTransferStatus;
  requested_by?: string | null;
  approved_by?: string | null;
  received_by?: string | null;
  requested_at: string;
  approved_at?: string | null;
  received_at?: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface InventoryTransferItem {
  id: string;
  transfer_request_id: string;
  item_id: string;
  batch_id?: string | null;
  requested_qty: number;
  approved_qty: number;
  received_qty: number;
  unit_cost: number;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface InventoryReorderSuggestion {
  item_id: string;
  item_name: string;
  sku: string;
  supplier_name: string;
  current_quantity: number;
  reorder_point: number;
  suggested_quantity: number;
  last_purchase_price: number | null;
  avg_cost: number | null;
  lead_time_days: number | null;
  warehouse_location: string;
  reason: string;
}

export interface InventoryItem {
  id: string;
  brand_id: string;
  name: string;
  sku: string;
  category: InventoryCategory;
  barcode?: string;
  english_name?: string;
  subcategory?: string;
  base_unit?: InventoryUnit;
  purchase_unit?: InventoryUnit;
  issue_unit?: InventoryUnit;
  conversion_factor?: number;
  weight?: number | null;
  volume?: number | null;
  unit: InventoryUnit;
  quantity: number;
  reorder_point: number;
  cost_per_unit: number | null;
  last_purchase_price?: number | null;
  avg_cost?: number | null;
  min_purchase_price?: number | null;
  max_purchase_price?: number | null;
  sale_price?: number | null;
  min_stock?: number | null;
  max_stock?: number | null;
  shelf_life_days?: number | null;
  expiry_date?: string | null;
  lead_time_days?: number | null;
  supplier_name: string;
  alternate_supplier_name?: string;
  storage_location: string;
  warehouse_location?: string;
  image_url?: string;
  is_active?: boolean;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface InventoryItemInput {
  id?: string;
  brand_id: string;
  name: string;
  sku: string;
  category: InventoryCategory;
  barcode?: string;
  english_name?: string;
  subcategory?: string;
  base_unit?: InventoryUnit;
  purchase_unit?: InventoryUnit;
  issue_unit?: InventoryUnit;
  conversion_factor?: number;
  weight?: number | null;
  volume?: number | null;
  unit: InventoryUnit;
  quantity: number;
  reorder_point: number;
  cost_per_unit: number | null;
  last_purchase_price?: number | null;
  avg_cost?: number | null;
  min_purchase_price?: number | null;
  max_purchase_price?: number | null;
  sale_price?: number | null;
  min_stock?: number | null;
  max_stock?: number | null;
  shelf_life_days?: number | null;
  expiry_date?: string | null;
  lead_time_days?: number | null;
  supplier_name: string;
  alternate_supplier_name?: string;
  storage_location: string;
  warehouse_location?: string;
  image_url?: string;
  is_active?: boolean;
  notes: string;
}

export interface InventoryMovementInput {
  brand_id: string;
  item_id: string;
  batch_id?: string | null;
  warehouse_id?: string | null;
  movement_type: InventoryMovementType;
  quantity: number;
  unit_cost?: number | null;
  reference_type?: string | null;
  reference_id?: string | null;
  reason?: string | null;
  user_id?: string | null;
  occurred_at?: string;
}

export interface InventoryCountInput {
  brand_id: string;
  warehouse_id: string;
  count_no: string;
  count_type: InventoryCountType;
  count_date: string;
  counted_by?: string | null;
  approved_by?: string | null;
  status?: string;
  book_qty: number;
  physical_qty: number;
  variance_reason?: string;
  notes?: string;
}

export interface InventoryTransferInput {
  brand_id: string;
  transfer_no: string;
  from_warehouse_id: string;
  to_warehouse_id: string;
  status?: InventoryTransferStatus;
  requested_by?: string | null;
  approved_by?: string | null;
  received_by?: string | null;
  requested_at?: string;
  approved_at?: string | null;
  received_at?: string | null;
  notes?: string;
}

export interface InventoryTransferItemInput {
  transfer_request_id: string;
  item_id: string;
  batch_id?: string | null;
  requested_qty: number;
  approved_qty?: number;
  received_qty?: number;
  unit_cost?: number;
  notes?: string;
}

export const INVENTORY_CATEGORY_LABELS: Record<InventoryCategory, string> = {
  protein: 'بروتين',
  vegetable: 'خضار',
  carbohydrate: 'كربوهيدرات',
  dairy: 'منتجات ألبان',
  sauce: 'صوصات',
  spices: 'بهارات وتوابل',
  oils: 'زيوت ودهون',
  dry_goods: 'مواد جافة',
  packaging: 'تغليف',
  cleaning: 'منظفات',
  beverage: 'مشروبات',
  finished_product: 'منتجات جاهزة',
  other: 'أخرى',
};

export const INVENTORY_UNIT_LABELS: Record<InventoryUnit, string> = {
  kg: 'كجم',
  g: 'جرام',
  l: 'لتر',
  ml: 'مل',
  piece: 'قطعة',
  box: 'علبة',
  tray: 'صينية',
  carton: 'كرتونة',
  bag: 'كيس',
  bottle: 'زجاجة',
  can: 'علبة',
  set: 'طقم',
  dozen: 'دستة',
};

export const INVENTORY_STATUS_LABELS: Record<InventoryStatus, string> = {
  healthy: 'مستقر',
  low: 'منخفض',
  critical: 'حرج',
  out: 'نفد',
};

export const INVENTORY_MOVEMENT_LABELS: Record<InventoryMovementType, string> = {
  purchase: 'شراء',
  customer_return: 'مرتجع عميل',
  warehouse_transfer_in: 'تحويل وارد',
  production_in: 'إنتاج وارد',
  production_out: 'أمر إنتاج',
  sale: 'بيع',
  waste: 'هالك',
  sample: 'عينات',
  internal_consumption: 'استهلاك داخلي',
  warehouse_transfer_out: 'تحويل صادر',
};

export const INVENTORY_COUNT_LABELS: Record<InventoryCountType, string> = {
  daily: 'يومي',
  weekly: 'أسبوعي',
  monthly: 'شهري',
  spot: 'مفاجئ',
};

export const INVENTORY_TRANSFER_STATUS_LABELS: Record<InventoryTransferStatus, string> = {
  draft: 'مسودة',
  requested: 'مطلوب',
  approved: 'معتمد',
  in_transit: 'في الطريق',
  received: 'مستلم',
  cancelled: 'ملغي',
};

export const INVENTORY_CATEGORY_ORDER: InventoryCategory[] = [
  'protein',
  'vegetable',
  'carbohydrate',
  'dairy',
  'sauce',
  'spices',
  'oils',
  'dry_goods',
  'packaging',
  'cleaning',
  'beverage',
  'finished_product',
  'other',
];

export const INVENTORY_UNIT_ORDER: InventoryUnit[] = ['kg', 'g', 'l', 'ml', 'piece', 'box', 'tray', 'carton', 'bag', 'bottle', 'can', 'set', 'dozen'];
